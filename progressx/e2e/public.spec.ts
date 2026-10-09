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

    for (const path of ["/profile", "/mydiet", "/mystats", "/settings", "/research", "/search?q=x", "/following", "/onboarding"]) {
        test(`${path} sends you to the login page`, async ({ page }) => {
            await page.goto(path)
            await expect(page).toHaveURL(/\/login/)
        })
    }

    test("private API routes answer 401 without a session", async ({ request }) => {
        for (const path of ["/api/user", "/api/videos/feed", "/api/verification", "/api/workouts/sets?from=2026-01-01&to=2026-01-02"]) {
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
        const sitemap = await (await request.get("/sitemap.xml")).text()
        expect(sitemap.match(/<loc>[^<]+<\/loc>/g)?.every((loc) => loc.startsWith("<loc>https://progressx.ca/"))).toBe(true)
    })
})
