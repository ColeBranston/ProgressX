// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import WeightCheckIn from "@/app/internal_components/weight/WeightCheckIn"
import { WeightEntry } from "@/app/internal_components/weight/weightLog"
import { LB_PER_KG } from "@/app/internal_components/profile/profileRules"

type Call = { url: string, method: string, body: Record<string, unknown> | null }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function stubWeightApi(entries: WeightEntry[], weightUnit: "lb" | "kg" = "lb", writes: (call: Call) => Response = (call) => json({ entry: { date: call.body?.date, period: call.body?.period, weightKg: call.body?.weightKg } })) {
    const calls: Call[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null }
        calls.push(call)
        return call.method === "GET" ? json({ entries, weightUnit }) : writes(call)
    }))
    return calls
}

const loaded = () => waitFor(() => expect(screen.getByRole("button", { name: /Log night weight|Night weight/ })).toBeEnabled())

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}))
afterEach(() => vi.unstubAllGlobals())

describe("WeightCheckIn", () => {
    it("shows the day's weigh-ins against yesterday's, with the week's trend", async () => {
        const calls = stubWeightApi([
            { date: "2026-10-13", period: "morning", weightKg: 80.5 },
            { date: "2026-10-14", period: "morning", weightKg: 80 },
            { date: "2026-10-10", period: "night", weightKg: 81 },
        ])
        render(<WeightCheckIn dateKey="2026-10-14" isToday />)

        expect(await screen.findByRole("button", { name: "Morning weight 176.4 lb. Edit" })).toBeInTheDocument()
        expect(calls[0].url).toBe("/api/weight?from=2026-10-07&to=2026-10-14")
        expect(screen.getByText("−1.1 vs yesterday")).toBeInTheDocument()
        expect(screen.getByText("Weigh yourself after waking up and before bed")).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Weight over the last 7 days" })).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "See trends →" })).toHaveAttribute("href", "/mystats/weight")
    })

    it("logs a weight, starting from the latest one, in the user's unit", async () => {
        const calls = stubWeightApi([{ date: "2026-10-14", period: "morning", weightKg: 80 }, { date: "2026-10-13", period: "night", weightKg: 81 }])
        render(<WeightCheckIn dateKey="2026-10-14" isToday />)
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "+ Log night weight" }))
        const input = screen.getByRole("textbox", { name: "Night weight in lb" })
        expect(input).toHaveValue("176.4")
        await userEvent.clear(input)
        await userEvent.type(input, "17x5,5")
        expect(input).toHaveValue("175,5")
        await userEvent.click(screen.getByRole("button", { name: "Save" }))

        expect(await screen.findByRole("button", { name: "Night weight 175.5 lb. Edit" })).toBeInTheDocument()
        const put = calls.find((c) => c.method === "PUT")!
        expect(put.body).toMatchObject({ date: "2026-10-14", period: "night" })
        expect(put.body?.weightKg).toBeCloseTo(175.5 / LB_PER_KG)
        expect(screen.getByText("−3.1 vs yesterday")).toBeInTheDocument()
    })

    it("won't save a weight that isn't one", async () => {
        const calls = stubWeightApi([], "kg")
        render(<WeightCheckIn dateKey="2026-10-14" isToday />)
        await loaded()
        expect(screen.getByText("Log a few days to see your trend")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "+ Log morning weight" }))
        const input = screen.getByRole("textbox", { name: "Morning weight in kg" })
        expect(input).toHaveValue("")
        await userEvent.click(screen.getByRole("button", { name: "Save" }))
        expect(screen.getByRole("alert")).toHaveTextContent("Enter your weight in kg")

        await userEvent.type(input, "5{Enter}")
        expect(screen.getByRole("alert")).toHaveTextContent("Enter your weight in kg")
        expect(calls.some((c) => c.method === "PUT")).toBe(false)

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
        expect(screen.getByRole("button", { name: "+ Log morning weight" })).toBeInTheDocument()
    })

    it("shows why a weight couldn't be saved", async () => {
        let answer = json({ message: "Too many updates" }, 429)
        stubWeightApi([], "kg", () => answer)
        render(<WeightCheckIn dateKey="2026-10-14" isToday />)
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "+ Log morning weight" }))
        await userEvent.type(screen.getByRole("textbox", { name: "Morning weight in kg" }), "80{Enter}")
        expect(await screen.findByRole("alert")).toHaveTextContent("Too many updates")

        answer = new Response("not json", { status: 500 })
        await userEvent.click(screen.getByRole("button", { name: "Save" }))
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your weight"))
    })

    it("edits and removes a weigh-in, and says when removing fails", async () => {
        let removeOk = false
        const calls = stubWeightApi(
            [{ date: "2026-10-14", period: "morning", weightKg: 80 }, { date: "2026-10-13", period: "morning", weightKg: 80 }],
            "kg",
            (call) => (call.method === "DELETE" ? json({}, removeOk ? 200 : 500) : json({ entry: { date: "2026-10-14", period: "morning", weightKg: 79.4 } })),
        )
        render(<WeightCheckIn dateKey="2026-10-14" isToday />)
        expect(await screen.findByText("same as yesterday")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Morning weight 80.0 kg. Edit" }))
        const input = screen.getByRole("textbox", { name: "Morning weight in kg" })
        expect(input).toHaveValue("80.0")
        await userEvent.clear(input)
        await userEvent.type(input, "79.4{Enter}")
        expect(await screen.findByRole("button", { name: "Morning weight 79.4 kg. Edit" })).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Remove morning weight" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't remove that weight")

        removeOk = true
        await userEvent.click(screen.getByRole("button", { name: "Remove morning weight" }))
        expect(await screen.findByRole("button", { name: "+ Log morning weight" })).toBeInTheDocument()
        expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([
            "/api/weight?date=2026-10-14&period=morning", "/api/weight?date=2026-10-14&period=morning",
        ])
    })

    it("names a past day, and still lets the user log when the history can't load", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)))
        render(<WeightCheckIn dateKey="2026-10-07" isToday={false} />)
        expect(screen.getByText("Wednesday, Oct 7")).toBeInTheDocument()
        await loaded()
        expect(console.error).toHaveBeenCalledWith("Failed to load weight log: ", expect.any(Error))
    })
})
