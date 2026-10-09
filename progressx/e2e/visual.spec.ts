import { expect, test } from "@playwright/test"

// Visual regression: the public pages must look like the committed baselines (e2e/visual.spec.ts-snapshots).
// After an intended design change, refresh them with: npx playwright test --project regression --update-snapshots
for (const [name, path] of [["login", "/login"], ["terms", "/terms"], ["privacy", "/privacy"]] as const) {
    test(`${name} page`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState("networkidle")
        await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true })
    })
}
