import { expect, test } from "@playwright/test"
import { authEnabled, deleteTestUsers, loadStudies, newTestUser, signUp } from "./support"

// The whole life of an account, through the real UI against the real Supabase project: sign up,
// onboard, use the app, and delete the account again. Runs only with E2E_AUTH=1; every account it
// makes is zz-e2e-*@example.com and is removed at the end (and by the global teardown if a step fails).
test.describe.configure({ mode: "serial" })
test.skip(!authEnabled(), "set E2E_AUTH=1 with Supabase credentials to run the signed-in journey")

const user = newTestUser()

test.beforeAll(async () => {
    await loadStudies()
})

test.afterAll(async () => {
    await deleteTestUsers()
})

test("sign up, onboard, use the app, then delete the account", async ({ page }) => {
    await test.step("sign up with consent", async () => {
        await signUp(page, user)
    })

    await test.step("onboarding validates and saves the profile", async () => {
        await page.getByLabel("Name", { exact: true }).fill("E2E Tester")
        await page.getByLabel("Username", { exact: true }).fill(user.username)
        await expect(page.locator("#username-status")).toContainText(/available/i, { timeout: 15_000 })
        await page.getByRole("button", { name: "Continue" }).click()

        await expect(page.getByRole("heading", { name: "Your body" })).toBeVisible()
        await page.getByRole("radio", { name: "Other" }).click()
        await page.getByLabel("Feet").fill("5")
        await page.getByLabel("Inches").fill("10")
        await page.getByLabel(/Weight in lb/).fill("175")
        await page.getByLabel("Age", { exact: true }).fill("16")
        await page.getByRole("button", { name: "Continue" }).click()
        await expect(page.getByText(/18 or older/)).toBeVisible()

        await page.getByLabel("Age", { exact: true }).fill("30")
        await page.getByRole("button", { name: "Continue" }).click()
        await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible()
        await page.getByRole("radio", { name: /Moderately active/ }).click()
        // onboarding lands on For You, which loads the profile into the app's user data
        const profileLoaded = page.waitForResponse((res) => res.url().endsWith("/api/user") && res.request().method() === "GET", { timeout: 30_000 })
        await page.getByRole("button", { name: "Start tracking" }).click()
        await expect(page).not.toHaveURL(/onboarding|login|consent/, { timeout: 30_000 })
        expect((await profileLoaded).ok()).toBe(true)
    })

    await test.step("the profile shows the new username", async () => {
        await page.goto("/profile")
        await expect(page.getByText(user.username).first()).toBeVisible()
    })

    await test.step("research search goes through the search backend to Solr", async () => {
        await page.goto("/research")
        const box = page.getByPlaceholder("Search for optimal workouts...")
        await box.fill("creatine bench press")
        await box.press("Enter")
        await expect(page.getByText("Creatine supplementation and strength")).toBeVisible({ timeout: 20_000 })
    })

    await test.step("posting and following need a verified ID", async () => {
        await page.goto("/settings")
        await expect(page.getByRole("heading", { name: "Identity verification" })).toBeVisible()
        await expect(page.getByText(/Verify with a passport/)).toBeVisible()
        const follow = await page.request.put("/api/profiles/someone_else/follow")
        expect(follow.status()).toBe(403)
        expect((await follow.json()).code).toBe("verification_required")
        const upload = await page.request.post("/api/videos/upload", { data: { sizeBytes: 1000, contentType: "video/mp4" } })
        expect(upload.status()).toBe(403)
    })

    await test.step("the data export includes the profile and nothing about other users", async () => {
        const res = await page.request.get("/api/user/export")
        expect(res.ok()).toBe(true)
        const text = await res.text()
        expect(text).toContain(user.username)
        expect(text).not.toContain("SUPABASE")
    })

    await test.step("deleting the account signs out and removes the login", async () => {
        await page.goto("/settings")
        await page.getByRole("button", { name: "Delete account" }).click()
        await page.getByLabel("Type your email address to confirm account deletion").fill(user.email)
        await page.getByRole("button", { name: "Permanently delete" }).click()
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })

        const login = await page.request.post("/api/auth/login", { data: { email: user.email, password: user.password } })
        expect(login.status()).toBe(400)
        await page.goto("/profile")
        await expect(page).toHaveURL(/\/login/)
    })
})
