// @vitest-environment jsdom
import { useState } from "react"
import { render, screen, waitFor } from "@testing-library/react"
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

describe("Settings personalized ads", () => {
    it("is off until the user turns it on, and saves the choice", async () => {
        let saved = { blurProgressPhotos: false, waterGoalMl: null, profilePrivacy: "private", weightUnit: "lb", activityLevel: 2, personalizedAds: false, sharing: { photos: "only_me", weight: "only_me", workouts: "only_me", diet: "only_me" } }
        const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === "PATCH") saved = { ...saved, ...JSON.parse(String(init.body)) }
            return json({ settings: saved, email: "me@example.com" })
        })
        vi.stubGlobal("fetch", fetch)
        render(<Page />)

        const toggle = await screen.findByRole("switch", { name: "Personalized ads" })
        expect(toggle).toHaveAttribute("aria-checked", "false")

        await userEvent.click(toggle)
        await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"))
        const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH")
        expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ personalizedAds: true })
    })
})
