import http from "node:http"
import https from "node:https"
import dns from "node:dns"
import net from "node:net"
import zlib from "node:zlib"

// Reads nutrition facts from a web page the user linked (a recipe, a restaurant's menu item, a product
// page). Prefers the page's schema.org NutritionInformation (most recipe sites and many restaurants
// publish it); otherwise returns the visible text around the nutrition facts for the model to read.
//
// The app server sits on a private network next to Solr, Redis and Ollama, so a fetched link must never
// reach them: every address a hostname resolves to (on every redirect, at connect time, so DNS tricks
// don't help) has to be public.

export type FoodPage = {
    url: string
    host: string
    title: string
    // "structured": schema.org nutrition data; "text": the page's own words
    kind: "structured" | "text"
    // clean lines for the number-reading step ("Serving size: 1 bowl (350 g)", "Calories: 450", ...)
    text: string
}

export class FoodPageError extends Error {}

const TIMEOUT_MS = 10_000
const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const MAX_TEXT = 6000
const USER_AGENT = "Mozilla/5.0 (compatible; ProgressX nutrition reader; +https://progressx.ca)"

// ---------- only public addresses ----------

function isPublicAddress(address: string): boolean {
    if (net.isIPv4(address)) {
        const [a, b] = address.split(".").map(Number)
        return !(
            a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||  // carrier-grade NAT
            (a === 169 && b === 254) ||             // link-local, cloud metadata
            (a === 172 && b >= 16 && b <= 31) ||    // includes Docker's networks
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) ||
            (a === 198 && (b === 18 || b === 19))
        )
    }
    if (net.isIPv6(address)) {
        const lower = address.toLowerCase()
        if (lower.startsWith("::ffff:")) return isPublicAddress(lower.slice(7))
        return !(lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff"))
    }
    return false
}

// Used by the socket itself, so the address that's checked is the one that's connected to
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4)
        const list = addresses as dns.LookupAddress[]
        const bad = list.find((entry) => !isPublicAddress(entry.address))
        if (bad || list.length === 0) return callback(new FoodPageError("That link points to a private address"), "", 4)
        if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
        callback(null, list[0].address, list[0].family)
    })
}

export function checkLink(raw: string): URL {
    let url: URL
    try {
        url = new URL(raw.trim())
    } catch {
        throw new FoodPageError("That doesn't look like a link")
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new FoodPageError("Only web links (http or https) can be read")
    if (url.username || url.password) throw new FoodPageError("Links with a username or password can't be read")
    if (url.port && !["80", "443"].includes(url.port)) throw new FoodPageError("That link uses an unusual port")
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".")) {
        throw new FoodPageError("That link points to a private address")
    }
    if (net.isIP(host.replace(/^\[|\]$/g, "")) && !isPublicAddress(host.replace(/^\[|\]$/g, ""))) {
        throw new FoodPageError("That link points to a private address")
    }
    return url
}

// ---------- fetching ----------

type Fetched = { url: URL, contentType: string, body: string }

function request(url: URL): Promise<{ status: number, headers: http.IncomingHttpHeaders, body: Buffer }> {
    return new Promise((resolve, reject) => {
        const client = url.protocol === "https:" ? https : http
        const req = client.request(url, {
            method: "GET",
            lookup: safeLookup,
            timeout: TIMEOUT_MS,
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "en-CA,en;q=0.9",
            },
        }, (res) => {
            const chunks: Buffer[] = []
            let size = 0
            res.on("data", (chunk: Buffer) => {
                size += chunk.length
                if (size > MAX_BYTES) {
                    req.destroy(new FoodPageError("That page is too big to read"))
                    return
                }
                chunks.push(chunk)
            })
            res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
            res.on("error", reject)
        })
        req.on("timeout", () => req.destroy(new FoodPageError("That page took too long to load")))
        req.on("error", reject)
        req.end()
    })
}

function decode(body: Buffer, encoding: string | undefined): string {
    try {
        if (encoding === "gzip") return zlib.gunzipSync(body, { maxOutputLength: MAX_BYTES * 4 }).toString("utf8")
        if (encoding === "deflate") return zlib.inflateSync(body, { maxOutputLength: MAX_BYTES * 4 }).toString("utf8")
        if (encoding === "br") return zlib.brotliDecompressSync(body, { maxOutputLength: MAX_BYTES * 4 }).toString("utf8")
    } catch {
        throw new FoodPageError("Couldn't read that page")
    }
    return body.toString("utf8")
}

async function fetchPage(start: URL): Promise<Fetched> {
    let url = start
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let res
        try {
            res = await request(url)
        } catch (e) {
            if (e instanceof FoodPageError) throw e
            throw new FoodPageError("Couldn't reach that page")
        }
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
            url = checkLink(new URL(res.headers.location, url).toString())
            continue
        }
        // bot protection answers with all sorts of codes (Akamai sends 405 "Access Denied", paywalls 402)
        if ([401, 402, 403, 405, 406, 429, 451].includes(res.status) || (res.status === 503 && /captcha|challenge|access denied/i.test(res.body.toString("utf8", 0, 4000)))) {
            throw new FoodPageError("That site blocks automated reading")
        }
        if (res.status === 404 || res.status === 410) throw new FoodPageError("That page doesn't exist (it may have moved)")
        if (res.status >= 400) throw new FoodPageError(`That page couldn't be loaded (error ${res.status})`)
        const contentType = String(res.headers["content-type"] ?? "")
        if (!/html|json|text\/plain/i.test(contentType)) throw new FoodPageError("That link isn't a web page")
        const body = decode(res.body, String(res.headers["content-encoding"] ?? "").toLowerCase())
        // some block pages come back as 200
        if (body.length < 3000 && /<title>\s*(access denied|attention required|just a moment|are you a robot)/i.test(body)) {
            throw new FoodPageError("That site blocks automated reading")
        }
        return { url, contentType, body }
    }
    throw new FoodPageError("That link redirects too many times")
}

// ---------- reading ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" }
const unescape = (text: string) => text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
})

const NUTRITION_FIELDS: [string, string][] = [
    ["servingSize", "Serving size"],
    ["calories", "Calories"],
    ["proteinContent", "Protein"],
    ["carbohydrateContent", "Carbohydrates"],
    ["fatContent", "Total fat"],
    ["saturatedFatContent", "Saturated fat"],
    ["fiberContent", "Fiber"],
    ["sugarContent", "Sugar"],
    ["sodiumContent", "Sodium"],
    ["cholesterolContent", "Cholesterol"],
]

// Finds schema.org NutritionInformation anywhere in the page's JSON-LD (Recipe.nutrition, MenuItem, Product...)
function structuredNutrition(html: string): { name: string, lines: string[] } | null {
    const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []
    for (const block of blocks) {
        let data: unknown
        try {
            data = JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/gi, "").trim())
        } catch {
            continue
        }
        const stack: { node: unknown, name: string }[] = [{ node: data, name: "" }]
        while (stack.length) {
            const { node, name } = stack.pop()!
            if (!node || typeof node !== "object") continue
            if (Array.isArray(node)) {
                for (const item of node) stack.push({ node: item, name })
                continue
            }
            const record = node as Record<string, unknown>
            const ownName = typeof record.name === "string" ? record.name : name
            const nutrition = record.nutrition as Record<string, unknown> | undefined
            const info = nutrition && typeof nutrition === "object" ? nutrition : String(record["@type"] ?? "").includes("NutritionInformation") ? record : null
            if (info) {
                const lines = NUTRITION_FIELDS
                    .filter(([key]) => info[key] !== undefined && info[key] !== null && String(info[key]).trim())
                    .map(([key, label]) => `${label}: ${String(info[key]).trim()}`)
                if (lines.some((line) => line.startsWith("Calories"))) {
                    const servings = record.recipeYield ?? record.yield
                    if (servings) lines.push(`Recipe makes: ${Array.isArray(servings) ? servings.join(" / ") : String(servings)} (the values above are per serving)`)
                    return { name: unescape(ownName), lines }
                }
            }
            for (const value of Object.values(record)) if (value && typeof value === "object") stack.push({ node: value, name: ownName })
        }
    }
    return null
}

function visibleText(html: string): string {
    return unescape(
        html
            .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
            .replace(/<!--[\s\S]*?-->/g, " ")
            .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th)[^>]*>/gi, "\n")
            // a tag, including quoted attribute values that contain ">"
            .replace(/<[a-z/!][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi, " "),
    ).replace(/[ \t\f\r]+/g, " ").replace(/\n\s*/g, "\n").trim()
}

// The part of the text with the nutrition facts in it: the densest window of nutrition words
function nutritionSection(text: string): string {
    const words = /calorie|kcal|protein|carbohydrate|carbs|fat|fib(er|re)|sodium|sugar|cholesterol|vitamin|calcium|iron|potassium|serving size|nutrition/gi
    const hits = [...text.matchAll(words)].map((m) => m.index ?? 0)
    if (hits.length < 3) return ""
    let best = 0, bestCount = 0
    for (let i = 0; i < hits.length; i++) {
        let j = i
        while (j < hits.length && hits[j] - hits[i] < MAX_TEXT * 0.8) j++
        if (j - i > bestCount) { bestCount = j - i; best = hits[i] }
    }
    const start = Math.max(0, best - 400)
    return text.slice(start, start + MAX_TEXT)
}

// ---------- sites that load their nutrition with JavaScript ----------
// Their pages arrive without the numbers, which the page then fetches from the site's own public data
// URL. For these we read that URL directly: the same plain request the page makes, no login or cookies.

type Adapter = {
    matches: (url: URL) => boolean
    read: (url: URL, userSaid: string[]) => Promise<FoodPage | null>
}

type StarbucksFact = { displayName?: string, value?: number | string, unitOfMeasure?: string, subfacts?: StarbucksFact[] }
type StarbucksSize = {
    name?: string
    nutrition?: { servingSize?: { displayValue?: string }, calories?: { displayValue?: number | string }, additionalFacts?: StarbucksFact[] }
}


const starbucks: Adapter = {
    // www.starbucks.com/menu/product/40881/iced, www.starbucks.ca/menu/product/40881/iced
    matches: (url) => /(^|\.)starbucks\.(com|ca)$/.test(url.hostname) && /^\/(en\/|fr\/)?menu\/product\/\d+\/[a-z-]+/i.test(url.pathname),
    async read(url, userSaid) {
        const [, , number, form] = url.pathname.match(/^\/(en\/|fr\/)?menu\/product\/(\d+)\/([a-z-]+)/i) ?? []
        if (!number || !form) return null
        const data = await fetchPage(checkLink(`${url.origin}/apiproxy/v1/ordering/${number}/${form}`))
        let product: { name?: string, sizes?: StarbucksSize[] } | undefined
        try {
            product = JSON.parse(data.body)?.products?.[0]
        } catch {
            return null
        }
        const sizes = (product?.sizes ?? []).filter((size) => size.nutrition?.calories?.displayValue !== undefined)
        if (!product?.name || sizes.length === 0) return null

        const row = (size: StarbucksSize) => {
            const facts: string[] = [`Calories ${size.nutrition!.calories!.displayValue}`]
            const add = (fact: StarbucksFact) => {
                if (fact.displayName && fact.value !== undefined && fact.value !== null) facts.push(`${fact.displayName} ${fact.value} ${fact.unitOfMeasure ?? ""}`.trim())
                for (const sub of fact.subfacts ?? []) add(sub)
            }
            for (const fact of size.nutrition!.additionalFacts ?? []) add(fact)
            return `Size ${size.name} (${(size.nutrition!.servingSize?.displayValue ?? "").trim()}): ${facts.join("; ")}`
        }

        // the size the user named; the read numbers are then only that size's
        const said = userSaid.join(" ").toLowerCase()
        const named = sizes.find((size) => size.name && new RegExp(`\\b${size.name.toLowerCase()}\\b`).test(said))
        const lines = named
            ? [row(named)]
            : ["Listed per drink size; the user didn't name one, so use Grande (the standard size) unless they say otherwise.", ...sizes.map(row)]
        const title = `${product.name} (Starbucks)`
        return { url: url.toString(), host: url.hostname.replace(/^www\./, ""), title, kind: "structured", text: [`Item: ${title}`, ...lines].join("\n") }
    },
}

const ADAPTERS: Adapter[] = [starbucks]

export async function readFoodPage(raw: string, userSaid: string[] = []): Promise<FoodPage> {
    const link = checkLink(raw)
    const adapter = ADAPTERS.find((a) => a.matches(link))
    if (adapter) {
        try {
            const read = await adapter.read(link, userSaid)
            if (read) return read
        } catch (e) {
            // the site changed its data URL; fall back to reading the page like any other
            if (!(e instanceof FoodPageError)) throw e
        }
    }

    const page = await fetchPage(link)
    const html = page.body
    const title = unescape((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? page.url.hostname).replace(/\s+/g, " ").trim()).slice(0, 160)
    const host = page.url.hostname.replace(/^www\./, "")

    const structured = /json/i.test(page.contentType) ? null : structuredNutrition(html)
    if (structured) {
        return {
            url: page.url.toString(), host, title: structured.name || title, kind: "structured",
            text: [`Item: ${structured.name || title}`, ...structured.lines].join("\n"),
        }
    }

    const section = nutritionSection(/json/i.test(page.contentType) ? html : visibleText(html))
    if (!section) throw new FoodPageError("Couldn't find nutrition facts on that page")
    return { url: page.url.toString(), host, title, kind: "text", text: `Page: ${title}\n${section}` }
}

// Links the user wrote in their own messages (the only ones the assistant may open)
export function linksIn(texts: string[]): string[] {
    const found: string[] = []
    for (const text of texts) {
        for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) found.push(match[0].replace(/[.,;:!?]+$/, ""))
    }
    return found
}
