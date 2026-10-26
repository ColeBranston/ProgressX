import { expect, test } from "@playwright/test"

test.describe("signed out", () => {
    test("the home page introduces the app and links to sign-in", async ({ page }) => {
        await page.goto("/")
        await expect(page).toHaveTitle(/ProgressX/)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://progressx.ca")
        const signIn = page.getByRole("link", { name: /log in|sign in|get started|sign up/i }).first()
        await expect(signIn).toBeVisible()
    })

    test("the login page has the sign-up form, consent boxes and its own canonical URL", async ({ page }) => {
        await page.goto("/login")
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://progressx.ca/login")
        await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible()
        await expect(page.getByRole("checkbox", { name: /18 years of age or older/ })).toBeVisible()
        // the switch between the two forms works from the keyboard too
        await page.getByRole("button", { name: "Log In" }).press("Enter")
        await expect(page.locator('button[type="submit"]', { hasText: "Log In" })).toBeVisible()
    })

    test("sign-up needs both consent boxes", async ({ page }) => {
        await page.goto("/login")
        await page.getByPlaceholder("Email").fill("zz-e2e-noconsent@example.com")
        await page.getByPlaceholder("Password", { exact: true }).fill("Whatever-123!")
        await page.getByPlaceholder("Confirm Password").fill("Whatever-123!")
        await page.getByRole("button", { name: "Sign Up" }).click()
        // the required boxes stop the form: still on /login, nothing submitted
        await expect(page).toHaveURL(/\/login/)
        expect(await page.getByRole("checkbox", { name: /18 years/ }).evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true)
    })

    // the pages that need an account (your own profile included) send you to log in
    for (const path of ["/profile", "/mydiet", "/mystats", "/settings", "/following", "/upload", "/onboarding"]) {
        test(`${path} sends you to the login page`, async ({ page }) => {
            await page.goto(path)
            await expect(page).toHaveURL(/\/login/)
        })
    }

    // the public feed, search and research can be browsed without an account
    for (const path of ["/explore", "/research", "/search?q=x"]) {
        test(`${path} can be browsed without an account`, async ({ page }) => {
            await page.goto(path)
            await expect.poll(() => { const url = new URL(page.url()); return url.pathname + url.search }).toBe(path)
            // the menu offers to log in where your profile would be (on phones, open the slide-in menu first)
            const openMenu = page.getByRole("button", { name: "Open menu" })
            if (await openMenu.isVisible()) await openMenu.click()
            await expect(page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Log in" })).toBeVisible()
        })
    }

    test("the public feed has its own title and canonical URL, and shared video links open in it", async ({ page }) => {
        await page.goto("/explore")
        await expect(page).toHaveTitle(/Explore/)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://progressx.ca/explore")
        await page.goto("/?v=00000000-0000-4000-8000-000000000000")
        await expect(page).toHaveURL(/\/explore\?v=00000000-0000-4000-8000-000000000000/)
    })

    test("the public feed answers without a session; personal API routes still answer 401", async ({ request }) => {
        const feed = await request.get("/api/videos/feed", { maxRedirects: 0 })
        expect(feed.status()).toBe(200)
        expect(Array.isArray((await feed.json()).videos)).toBe(true)

        for (const path of ["/api/user", "/api/videos?user=me", "/api/profiles/me/followers", "/api/verification", "/api/workouts/sets?from=2026-01-01&to=2026-01-02"]) {
            const res = await request.get(path, { maxRedirects: 0 })
            expect([401, 307], path).toContain(res.status())
        }
    })

    test("terms and privacy policy are public and cover government ID", async ({ page }) => {
        await page.goto("/terms")
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        await page.goto("/privacy")
        await expect(page.getByRole("heading", { name: /Government ID/i })).toBeVisible()
    })

    test("robots.txt and the sitemap only list the canonical https site", async ({ request }) => {
        const robots = await (await request.get("/robots.txt")).text()
        expect(robots).toContain("Sitemap: https://progressx.ca/sitemap.xml")
        expect(robots).toMatch(/Disallow: \/api\//)
        expect(robots).toMatch(/Allow: \/explore/)
        expect(robots).toMatch(/Disallow: \/profile\$/)
        const sitemap = await (await request.get("/sitemap.xml")).text()
        expect(sitemap.match(/<loc>[^<]+<\/loc>/g)?.every((loc) => loc.startsWith("<loc>https://progressx.ca/"))).toBe(true)
    })
})
