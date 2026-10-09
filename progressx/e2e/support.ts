import { createClient } from "@supabase/supabase-js"
import { type Page, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"

export const TEST_EMAIL_PREFIX = "zz-e2e-"
const TEST_SOLR_URL = (process.env.SOLR_TEST_URL ?? "http://127.0.0.1:8984/solr").replace(/\/$/, "")

export const fixture = (name: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../../ci/test/fixtures", name), "utf8"))

export async function loadStudies() {
    if (/:8983\b/.test(TEST_SOLR_URL)) throw new Error("Refusing to write to what looks like the live Solr")
    for (const body of [{ delete: { query: "*:*" } }, fixture("studies.json")]) {
        const res = await fetch(`${TEST_SOLR_URL}/clean_ingestion_data/update?commit=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        if (!res.ok) throw new Error(`Couldn't load the test studies: ${res.status}`)
    }
}

export const authEnabled = () => process.env.E2E_AUTH === "1" && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

export function newTestUser() {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    return { email: `${TEST_EMAIL_PREFIX}${id}@example.com`, password: `E2e-${id}-${Math.random().toString(36).slice(2)}!`, username: `zz_e2e_${id}`.slice(0, 20) }
}

// Deletes zz-e2e-*@example.com accounts only (never anything else) through the Supabase admin API
export async function deleteTestUsers() {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    for (let page = 1; page < 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
        if (error) throw error
        for (const user of data.users) {
            if (user.email?.startsWith(TEST_EMAIL_PREFIX) && user.email.endsWith("@example.com")) {
                await admin.from("profiles").delete().eq("id", user.id)
                await admin.auth.admin.deleteUser(user.id)
            }
        }
        if (data.users.length < 200) break
    }
}

export async function signUp(page: Page, user: { email: string, password: string }) {
    await page.goto("/login")
    // the page opens on "Sign Up"
    await page.getByPlaceholder("Email").fill(user.email)
    await page.getByPlaceholder("Password", { exact: true }).fill(user.password)
    await page.getByPlaceholder("Confirm Password").fill(user.password)
    await page.getByRole("checkbox", { name: /18 years of age or older/ }).check()
    await page.getByRole("checkbox", { name: /Terms of Service/ }).check()
    await page.getByRole("button", { name: "Sign Up" }).click()

    // signing up switches to Log In with the details kept (and the password still masked)
    const logIn = page.locator('button[type="submit"]', { hasText: "Log In" })
    await expect(logIn).toBeVisible({ timeout: 30_000 })
    await expect(page.getByPlaceholder("Email")).toHaveValue(user.email)
    await expect(page.getByPlaceholder("Password", { exact: true })).toHaveAttribute("type", "password")
    await logIn.click()
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
}
