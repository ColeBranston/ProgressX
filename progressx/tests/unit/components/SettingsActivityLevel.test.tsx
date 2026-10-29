// @vitest-environment jsdom
import { useState } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { userDataContext, UserData } from "@/app/contexts/userData"
import SettingsPage from "@/app/(main)/settings/page"

vi.mock("@/app/internal_components/verification/IdVerification", () => ({ default: () => null }))

const settings = { blurProgressPhotos: false, waterGoalMl: null, profilePrivacy: "private", weightUnit: "lb", activityLevel: 1, personalizedAds: false, sharing: { photos: "only_me", weight: "only_me", workouts: "only_me", diet: "only_me" } }
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

// Like the real server, each PATCH is saved as soon as it arrives and answered with the settings as they
// were then, but the answer is held back until the test resolves it, so saves can overlap
function stubSettingsApi() {
    const patches: { level: number, body: Record<string, unknown>, resolve: () => void }[] = []
    let saved = { ...settings }
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== "/api/user/settings") return json({})
        if (init?.method !== "PATCH") return json({ settings: saved, email: "me@example.com" })
        const body = JSON.parse(String(init.body))
        saved = { ...saved, ...body }
        const answer = { settings: saved, email: "me@example.com" }
        await new Promise<void>((resolve) => patches.push({ level: body.activityLevel, body, resolve }))
        return json(answer)
    }))
    return { patches, saved: () => saved }
}

function Page() {
    const [ userData, setUserData ] = useState<UserData>({ weight: 180, gender: "male", activity: 1 })
    return (
        <userDataContext.Provider value={{ userData, setUserData }}>
            <SettingsPage />
            <output data-testid="activity">{userData.activity}</output>
        </userDataContext.Provider>
    )
}

afterEach(() => vi.unstubAllGlobals())

describe("Settings activity level", () => {
    it("saves overlapping picks in order, so the last one picked wins", async () => {
        const api = stubSettingsApi()
        render(<Page />)
        const select = await screen.findByRole("combobox", { name: "Activity level" })

        await userEvent.selectOptions(select, "2")
        await waitFor(() => expect(api.patches).toHaveLength(1))
        await userEvent.selectOptions(select, "4") // picked while the first save is still in flight
        expect(select).toHaveValue("4")
        expect(api.patches).toHaveLength(1) // waits for the first save instead of overlapping it

        api.patches[0].resolve()
        await waitFor(() => expect(api.patches).toHaveLength(2))
        expect(api.patches[1].level).toBe(4)
        api.patches[1].resolve()

        await waitFor(() => expect(screen.getByTestId("activity")).toHaveTextContent("4"))
        expect(select).toHaveValue("4")
        expect(api.saved().activityLevel).toBe(4)
    })

    it("skips the second save when the user picks the original level back", async () => {
        const api = stubSettingsApi()
        render(<Page />)
        const select = await screen.findByRole("combobox", { name: "Activity level" })

        await userEvent.selectOptions(select, "3")
        await waitFor(() => expect(api.patches).toHaveLength(1))
        await userEvent.selectOptions(select, "5")
        await userEvent.selectOptions(select, "3") // only the latest queued pick is kept

        api.patches[0].resolve()
        await waitFor(() => expect(screen.getByTestId("activity")).toHaveTextContent("3"))
        expect(api.patches).toHaveLength(1)
        expect(select).toHaveValue("3")
    })

    it("keeps a newer activity level when an older water goal save answers last", async () => {
        const api = stubSettingsApi()
        render(<Page />)
        const select = await screen.findByRole("combobox", { name: "Activity level" })

        await userEvent.click(screen.getByRole("radio", { name: "Custom" }))
        const water = screen.getByRole("spinbutton", { name: "Custom daily water goal in millilitres" })
        await userEvent.clear(water)
        await userEvent.type(water, "2500")
        await userEvent.click(screen.getByRole("button", { name: "Save goal" }))
        await waitFor(() => expect(api.patches).toHaveLength(1)) // its answer still says activity level 1

        await userEvent.selectOptions(select, "4")
        await waitFor(() => expect(api.patches).toHaveLength(2))
        api.patches[1].resolve()
        await waitFor(() => expect(screen.getByTestId("activity")).toHaveTextContent("4"))

        api.patches[0].resolve() // the older answer arrives last
        await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument())
        expect(select).toHaveValue("4")
        expect(api.saved()).toMatchObject({ activityLevel: 4, waterGoalMl: 2500 })
    })
})
