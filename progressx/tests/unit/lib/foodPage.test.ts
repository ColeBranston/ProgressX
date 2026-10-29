import { EventEmitter } from "node:events"
import zlib from "node:zlib"
import { beforeEach, describe, expect, it, vi } from "vitest"

// The network, faked at node:http / node:https / node:dns: each test says what every URL answers and
// what each hostname resolves to. The request runs the page reader's own lookup, as a real socket would.

type Page = { status?: number, headers?: Record<string, string>, body?: string | Buffer, chunks?: Buffer[], timeout?: boolean, fail?: Error }

const pages = new Map<string, Page>()
const addresses = new Map<string, { address: string, family: number }[] | Error>()
const requested: string[] = []

function fakeRequest(url: URL, options: { lookup: (host: string, opts: object, cb: (err: Error | null, address: unknown, family?: number) => void) => void }, onResponse: (res: EventEmitter & { statusCode: number, headers: Record<string, string> }) => void) {
    const req = new EventEmitter() as EventEmitter & { end: () => void, destroy: (err: Error) => void }
    let destroyed = false
    req.destroy = (err) => {
        destroyed = true
        req.emit("error", err)
    }
    req.end = () => {
        requested.push(url.toString())
        options.lookup(url.hostname, {}, (err) => {
            if (err) return req.emit("error", err)
            const page = pages.get(url.toString())
            if (!page) return req.emit("error", Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }))
            if (page.timeout) return req.emit("timeout")
            if (page.fail) return req.emit("error", page.fail)
            const res = Object.assign(new EventEmitter(), { statusCode: page.status ?? 200, headers: { "content-type": "text/html; charset=utf-8", ...page.headers } })
            onResponse(res)
            for (const chunk of page.chunks ?? [Buffer.from(page.body ?? "")]) {
                if (destroyed) return
                res.emit("data", chunk)
            }
            res.emit("end")
        })
    }
    return req
}

vi.mock("node:https", () => ({ default: { request: fakeRequest } }))
vi.mock("node:http", () => ({ default: { request: fakeRequest } }))
vi.mock("node:dns", () => ({
    default: {
        lookup: (host: string, _options: object, cb: (err: Error | null, list?: unknown) => void) => {
            const found = addresses.get(host) ?? [{ address: "93.184.216.34", family: 4 }]
            if (found instanceof Error) cb(found)
            else cb(null, found)
        },
    },
}))

const { checkLink, FoodPageError, linksIn, readFoodPage } = await import("@/app/api/libs/foodPage")

beforeEach(() => {
    pages.clear()
    addresses.clear()
    requested.length = 0
})

const html = (head: string, body = "") => `<html><head>${head}</head><body>${body}</body></html>`
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

describe("checkLink", () => {
    it("accepts ordinary web links", () => {
        expect(checkLink("  https://www.allrecipes.com/recipe/1/stew ").hostname).toBe("www.allrecipes.com")
        expect(checkLink("http://93.184.216.34/page").hostname).toBe("93.184.216.34")
        expect(checkLink("https://example.com:443/x").pathname).toBe("/x")
    })

    it.each([
        ["not a link", "That doesn't look like a link"],
        ["ftp://example.com/file", "Only web links (http or https) can be read"],
        ["https://user:pass@example.com/", "Links with a username or password can't be read"],
        ["https://example.com:8080/", "That link uses an unusual port"],
        ["http://localhost/admin", "That link points to a private address"],
        ["http://solr.internal/", "That link points to a private address"],
        ["http://printer.local/", "That link points to a private address"],
        ["http://intranet/", "That link points to a private address"],
        ["http://10.0.0.5/", "That link points to a private address"],
        ["http://127.0.0.1/", "That link points to a private address"],
        ["http://169.254.169.254/latest/meta-data", "That link points to a private address"],
        ["http://172.20.0.3/", "That link points to a private address"],
        ["http://192.168.1.1/", "That link points to a private address"],
        ["http://100.64.0.1/", "That link points to a private address"],
        ["http://[::1]/", "That link points to a private address"],
        ["http://[fd00::1]/", "That link points to a private address"],
        ["http://[fe80::1]/", "That link points to a private address"],
        ["http://[::ffff:10.0.0.1]/", "That link points to a private address"],
    ])("refuses %s", (link, message) => {
        expect(() => checkLink(link)).toThrow(new FoodPageError(message))
    })

    it("refuses IPv6 literals outright (they have no dot)", () => {
        expect(() => checkLink("http://[2606:4700::1111]/")).toThrow("That link points to a private address")
    })
})

describe("readFoodPage: fetching", () => {
    const url = "https://recipes.example.com/stew"
    const page = html("<title>Stew</title>", "<p>Nutrition facts</p><p>Calories 300</p><p>Protein 20 g</p><p>Fat 10 g</p>")

    it("never connects to a hostname that resolves to a private address", async () => {
        addresses.set("recipes.example.com", [{ address: "93.184.216.34", family: 4 }, { address: "10.1.2.3", family: 4 }])
        pages.set(url, { body: page })
        await expect(readFoodPage(url)).rejects.toThrow("That link points to a private address")
    })

    it.each([["::1"], ["fc00::5"], ["fe80::1"], ["ff02::1"], ["::ffff:127.0.0.1"], ["0.0.0.0"], ["198.18.0.1"], ["not-an-ip"]])("refuses a hostname resolving to %s", async (address) => {
        addresses.set("recipes.example.com", [{ address, family: 6 }])
        pages.set(url, { body: page })
        await expect(readFoodPage(url)).rejects.toThrow("That link points to a private address")
    })

    it("reads a hostname resolving to a public IPv6 address", async () => {
        addresses.set("recipes.example.com", [{ address: "2606:4700::1111", family: 6 }, { address: "::ffff:93.184.216.34", family: 6 }])
        pages.set(url, { body: page })
        expect((await readFoodPage(url)).kind).toBe("text")
    })

    it("treats a hostname that doesn't resolve as unreachable", async () => {
        addresses.set("recipes.example.com", new Error("ENOTFOUND"))
        await expect(readFoodPage(url)).rejects.toThrow("Couldn't reach that page")
        addresses.set("recipes.example.com", [])
        await expect(readFoodPage(url)).rejects.toThrow("That link points to a private address")
    })

    it("follows redirects, checking each one", async () => {
        pages.set(url, { status: 301, headers: { location: "/stew-2" } })
        pages.set("https://recipes.example.com/stew-2", { body: page })
        expect((await readFoodPage(url)).url).toBe("https://recipes.example.com/stew-2")

        pages.set(url, { status: 302, headers: { location: "http://127.0.0.1/admin" } })
        await expect(readFoodPage(url)).rejects.toThrow("That link points to a private address")
    })

    it("gives up after three redirects", async () => {
        for (let i = 0; i < 5; i++) pages.set(`https://recipes.example.com/r${i}`, { status: 307, headers: { location: `/r${i + 1}` } })
        await expect(readFoodPage("https://recipes.example.com/r0")).rejects.toThrow("That link redirects too many times")
        expect(requested).toHaveLength(4)
    })

    it.each([
        [{ status: 403 }, "That site blocks automated reading"],
        [{ status: 429 }, "That site blocks automated reading"],
        [{ status: 503, body: "<h1>Please complete the CAPTCHA</h1>" }, "That site blocks automated reading"],
        [{ status: 503, body: "down for maintenance" }, "That page couldn't be loaded (error 503)"],
        [{ status: 404 }, "That page doesn't exist (it may have moved)"],
        [{ status: 410 }, "That page doesn't exist (it may have moved)"],
        [{ status: 500 }, "That page couldn't be loaded (error 500)"],
        [{ headers: { "content-type": "image/jpeg" } }, "That link isn't a web page"],
        [{ body: "<html><title>Just a moment...</title></html>" }, "That site blocks automated reading"],
        [{ timeout: true }, "That page took too long to load"],
        [{ fail: new Error("socket hang up") }, "Couldn't reach that page"],
        [{ chunks: [Buffer.alloc(1024 * 1024), Buffer.alloc(1024 * 1024), Buffer.alloc(10)] }, "That page is too big to read"],
        [{ headers: { "content-encoding": "gzip" }, body: "not gzip" }, "Couldn't read that page"],
    ])("explains a page that can't be read: %j", async (answer, message) => {
        pages.set(url, answer)
        await expect(readFoodPage(url)).rejects.toThrow(new FoodPageError(message))
    })

    it.each([
        ["gzip", zlib.gzipSync],
        ["deflate", zlib.deflateSync],
        ["br", zlib.brotliCompressSync],
    ] as const)("decodes %s pages", async (encoding, compress) => {
        pages.set(url, { headers: { "content-encoding": encoding }, body: compress(Buffer.from(page)) })
        expect((await readFoodPage(url)).title).toBe("Stew")
    })
})

describe("readFoodPage: reading", () => {
    const url = "https://www.recipes.example.com/beef-stew"

    it("prefers the page's schema.org nutrition data", async () => {
        pages.set(url, {
            body: html(
                "<title>Ignored &amp; title</title>" +
                "<script type=\"application/ld+json\">{ not json</script>" +
                jsonLd({ "@context": "https://schema.org", "@graph": [
                    { "@type": "WebPage", name: "Page" },
                    { "@type": "Recipe", name: "Mom&#39;s Beef &amp; Barley Stew", recipeYield: ["6", "6 bowls"], nutrition: {
                        "@type": "NutritionInformation", servingSize: "1 bowl", calories: "420 kcal", proteinContent: "32 g", fatContent: "14 g", sodiumContent: " ", sugarContent: null,
                    } },
                ] }),
            ),
        })
        expect(await readFoodPage(url)).toEqual({
            url,
            host: "recipes.example.com",
            title: "Mom's Beef & Barley Stew",
            kind: "structured",
            text: "Item: Mom's Beef & Barley Stew\nServing size: 1 bowl\nCalories: 420 kcal\nProtein: 32 g\nTotal fat: 14 g\nRecipe makes: 6 / 6 bowls (the values above are per serving)",
        })
    })

    it("reads a bare NutritionInformation block, named after its parent", async () => {
        pages.set(url, { body: html("<title>Menu</title>" + jsonLd({ "@type": "MenuItem", name: "Poutine", offers: { nutrition: { "@type": "NutritionInformation", calories: "740" } } })) })
        const read = await readFoodPage(url)
        expect(read).toMatchObject({ title: "Poutine", kind: "structured", text: "Item: Poutine\nCalories: 740" })
    })

    it("skips nutrition data without calories, and falls back to the page's text", async () => {
        const filler = "<p>Our story. ".repeat(50) + "</p>"
        pages.set(url, {
            body: html(
                "<title>Beef stew &#x2014; Recipes</title><style>.a{}</style>" + jsonLd({ "@type": "Recipe", nutrition: { proteinContent: "5 g" } }),
                `${filler}<script>var calories = 1</script><!-- protein --><div class="facts" data-x="a>b">Nutrition Facts</div><table><tr><td>Calories</td><td>450</td></tr><tr><td>Protein</td><td>30 g</td></tr><tr><td>Total fat</td><td>12 g</td></tr></table>`,
            ),
        })
        const read = await readFoodPage(url)
        expect(read.kind).toBe("text")
        expect(read.title).toBe("Beef stew — Recipes")
        expect(read.text).toMatch(/^Page: Beef stew — Recipes\n/)
        // each table cell on its own line, starting a little before the nutrition words
        expect(read.text).toContain("Our story. \nNutrition Facts\nCalories\n450\nProtein\n30 g\nTotal fat\n12 g")
        expect(read.text).not.toContain("var calories")
    })

    it("reads JSON as text", async () => {
        pages.set(url, { headers: { "content-type": "application/json" }, body: JSON.stringify({ calories: 100, protein: 5, fat: 2, name: "Bar" }) })
        const read = await readFoodPage(url)
        expect(read).toMatchObject({ kind: "text", title: "www.recipes.example.com" })
        expect(read.text).toContain("\"calories\":100")
    })

    it("says so when there are no nutrition facts", async () => {
        pages.set(url, { body: html("<title>About us</title>", "<p>We love food.</p>") })
        await expect(readFoodPage(url)).rejects.toThrow("Couldn't find nutrition facts on that page")
    })
})

describe("readFoodPage: Starbucks", () => {
    const link = "https://www.starbucks.ca/menu/product/40881/iced?parent=/drinks"
    const data = "https://www.starbucks.ca/apiproxy/v1/ordering/40881/iced"
    const product = {
        products: [{
            name: "Iced Caffè Latte",
            sizes: [
                { name: "Tall", nutrition: { servingSize: { displayValue: "354 mL " }, calories: { displayValue: 130 }, additionalFacts: [{ displayName: "Total Fat", value: 4.5, unitOfMeasure: "g", subfacts: [{ displayName: "Saturated Fat", value: 3, unitOfMeasure: "g" }] }, { displayName: "Caffeine", value: null }] } },
                { name: "Grande", nutrition: { servingSize: { displayValue: "473 mL" }, calories: { displayValue: 190 }, additionalFacts: [{ displayName: "Protein", value: 12 }] } },
                { name: "Trenta", nutrition: {} },
            ],
        }],
    }

    it("reads every size from the site's data when the user didn't name one", async () => {
        pages.set(data, { headers: { "content-type": "application/json" }, body: JSON.stringify(product) })
        const read = await readFoodPage(link)
        expect(read).toEqual({
            url: link,
            host: "starbucks.ca",
            title: "Iced Caffè Latte (Starbucks)",
            kind: "structured",
            text: [
                "Item: Iced Caffè Latte (Starbucks)",
                "Listed per drink size; the user didn't name one, so use Grande (the standard size) unless they say otherwise.",
                "Size Tall (354 mL): Calories 130; Total Fat 4.5 g; Saturated Fat 3 g",
                "Size Grande (473 mL): Calories 190; Protein 12",
            ].join("\n"),
        })
    })

    it("reads only the size the user named", async () => {
        pages.set(data, { headers: { "content-type": "application/json" }, body: JSON.stringify(product) })
        const read = await readFoodPage(link, ["a tall iced latte"])
        expect(read.text).toBe("Item: Iced Caffè Latte (Starbucks)\nSize Tall (354 mL): Calories 130; Total Fat 4.5 g; Saturated Fat 3 g")
    })

    it.each([
        ["data that isn't JSON", { headers: { "content-type": "application/json" }, body: "<html>" }],
        ["no sizes", { headers: { "content-type": "application/json" }, body: JSON.stringify({ products: [{ name: "Latte", sizes: [] }] }) }],
        ["a data URL that moved", { status: 404 }],
    ])("falls back to the page itself on %s", async (_case, answer) => {
        pages.set(data, answer)
        pages.set(link, { body: html("<title>Latte</title>", "<p>Calories 190, Protein 12 g, Fat 7 g</p>") })
        const read = await readFoodPage(link)
        expect(read).toMatchObject({ kind: "text", title: "Latte" })
    })

    it("doesn't treat other Starbucks pages as products", async () => {
        const other = "https://www.starbucks.com/menu"
        pages.set(other, { body: html("<title>Menu</title>", "<p>Calories, protein and fat for every drink</p>") })
        expect((await readFoodPage(other)).kind).toBe("text")
        expect(requested).toEqual([other])
    })
})

describe("linksIn", () => {
    it("finds the links people write, without trailing punctuation", () => {
        expect(linksIn(["try https://a.example.com/x?y=1. or (http://b.example.com/z)", "no links", "<https://c.example.com/>!"])).toEqual([
            "https://a.example.com/x?y=1",
            "http://b.example.com/z",
            "https://c.example.com/",
        ])
    })
})
