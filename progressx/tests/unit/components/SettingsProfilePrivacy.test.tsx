// @vitest-environment jsdom
import { useState } from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { userDataContext, UserData } from "@/app/contexts/userData"
import SettingsPage from "@/app/(main)/settings/page"

vi.mock("@/app/internal_components/verification/IdVerification", () => ({ default: () => null }))

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

function Page() {
    const [ userData, setUserData ] = useState<UserData>({ weight: 180, gender: "male", activity: 2 })
    return <userDataContext.Provider value={{ userData, setUserData }}><SettingsPage /></userDataContext.Provider>
}

afterEach(() => vi.unstubAllGlobals())

describe("Settings profile privacy", () => {
    it("has visibility and the four things a profile can show, all off, and saves each one without undoing another", async () => {
        let saved = { blurProgressPhotos: false, waterGoalMl: null, profilePrivacy: "public", weightUnit: "lb", activityLevel: 2, personalizedAds: false, sharing: { photos: false, weight: false, workouts: false, diet: false } }
        const patches: unknown[] = []
        vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === "PATCH") {
                const patch = JSON.parse(String(init.body))
                patches.push(patch)
                saved = { ...saved, ...patch }
            }
            return json({ settings: saved, email: "me@example.com" })
        }))
        render(<Page />)

        const section = within(await screen.findByRole("region", { name: "Profile privacy" }))
        expect(section.getByRole("radiogroup", { name: "Profile visibility" })).toBeInTheDocument()
        const switches = section.getAllByRole("switch")
        expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual([
            "Show progress photos on my profile", "Show weight on my profile", "Show workouts on my profile", "Show diet on my profile",
        ])
        expect(switches.every((s) => s.getAttribute("aria-checked") === "false")).toBe(true)

        await userEvent.click(section.getByRole("switch", { name: "Show weight on my profile" }))
        await userEvent.click(section.getByRole("switch", { name: "Show diet on my profile" }))
        await waitFor(() => expect(saved.sharing).toEqual({ photos: false, weight: true, workouts: false, diet: true }))
        expect(patches.at(-1)).toEqual({ sharing: { photos: false, weight: true, workouts: false, diet: true } })
        expect(section.getByRole("switch", { name: "Show weight on my profile" })).toHaveAttribute("aria-checked", "true")
    })

    it("says the choices don't apply while the profile is private", async () => {
        const settings = { blurProgressPhotos: false, waterGoalMl: null, profilePrivacy: "private", weightUnit: "lb", activityLevel: 2, personalizedAds: false, sharing: { photos: true, weight: false, workouts: false, diet: false } }
        vi.stubGlobal("fetch", vi.fn(async () => json({ settings, email: "me@example.com" })))
        render(<Page />)
        const section = within(await screen.findByRole("region", { name: "Profile privacy" }))
        expect(section.getByText(/only apply while your profile is public/)).toBeInTheDocument()
    })
})
