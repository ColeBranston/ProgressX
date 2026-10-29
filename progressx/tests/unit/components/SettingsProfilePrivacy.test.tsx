// @vitest-environment jsdom
import { useState } from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { userDataContext, UserData } from "@/app/contexts/userData"
import SettingsPage from "@/app/(main)/settings/page"

vi.mock("@/app/internal_components/verification/IdVerification", () => ({ default: () => null }))

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
const onlyMe = { photos: "only_me", weight: "only_me", workouts: "only_me", diet: "only_me" }

function Page() {
    const [ userData, setUserData ] = useState<UserData>({ weight: 180, gender: "male", activity: 2 })
    return <userDataContext.Provider value={{ userData, setUserData }}><SettingsPage /></userDataContext.Provider>
}

afterEach(() => vi.unstubAllGlobals())

describe("Settings profile privacy", () => {
    it("has visibility and an audience for each kind of tracking, all only me, and saves each without undoing another", async () => {
        let saved = { blurProgressPhotos: false, waterGoalMl: null, profilePrivacy: "public", weightUnit: "lb", activityLevel: 2, personalizedAds: false, sharing: onlyMe }
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
        for (const kind of ["progress photos", "weight", "workouts", "diet"]) {
            const group = within(section.getByRole("radiogroup", { name: `Who sees your ${kind}` }))
            expect(group.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Only me", "Followers", "Everyone"])
            expect(group.getByRole("radio", { name: "Only me" })).toHaveAttribute("aria-checked", "true")
        }

        await userEvent.click(within(section.getByRole("radiogroup", { name: "Who sees your weight" })).getByRole("radio", { name: "Everyone" }))
        await userEvent.click(within(section.getByRole("radiogroup", { name: "Who sees your diet" })).getByRole("radio", { name: "Followers" }))
        await waitFor(() => expect(saved.sharing).toEqual({ photos: "only_me", weight: "everyone", workouts: "only_me", diet: "followers" }))
        expect(patches.at(-1)).toEqual({ sharing: { photos: "only_me", weight: "everyone", workouts: "only_me", diet: "followers" } })
    })

    it("explains that a private profile's tracking only reaches approved followers", async () => {
        const settings = { blurProgressPhotos: false, waterGoalMl: null, profilePrivacy: "private", weightUnit: "lb", activityLevel: 2, personalizedAds: false, sharing: onlyMe }
        vi.stubGlobal("fetch", vi.fn(async () => json({ settings, email: "me@example.com" })))
        render(<Page />)
        const section = within(await screen.findByRole("region", { name: "Profile privacy" }))
        expect(section.getByText(/only followers you've approved can see anything/)).toBeInTheDocument()
        expect(section.getByText(/People have to ask to follow you/)).toBeInTheDocument()
    })
})
