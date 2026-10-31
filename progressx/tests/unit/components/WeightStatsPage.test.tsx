// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import WeightStatsPage from "@/app/(main)/mystats/weight/page"
import { WeightEntry } from "@/app/internal_components/weight/weightLog"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function stubWeightApi(entries: WeightEntry[], weightUnit = "kg") {
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        urls.push(url)
        return json({ entries, weightUnit })
    }))
    return urls
}

// a stat tile's label, value and caption, read together
const tile = (label: string) => screen.getByText(label).parentElement!

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 14, 12)) // Wednesday 14 October 2026
    // jsdom has no layout: give the chart a width so it draws, and a no-op ResizeObserver
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800)
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
    vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("weight stats page", () => {
    it("summarises the weigh-ins in range", async () => {
        const urls = stubWeightApi([
            { date: "2026-10-14", period: "morning", weightKg: 80 },
            { date: "2026-10-14", period: "night", weightKg: 81 },
            { date: "2026-10-13", period: "morning", weightKg: 81 },
            { date: "2026-10-05", period: "morning", weightKg: 82 },
            { date: "2026-10-01", period: "night", weightKg: 83 },
            { date: "2026-01-01", period: "morning", weightKg: 99 }, // outside the range: ignored
        ])
        render(<WeightStatsPage />)
        expect(screen.getByRole("status", { name: "Loading your weight" })).toBeInTheDocument()
        // placeholder shapes, not a spinner
        expect(screen.getByRole("status", { name: "Loading your weight" }).querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0)

        expect(await screen.findByText("Latest")).toBeInTheDocument()
        expect(urls[0]).toBe("/api/weight?from=2026-07-10&to=2026-10-14")
        expect(tile("Latest")).toHaveTextContent("80.0 kgMorning, today")
        expect(tile("Change over 90 days")).toHaveTextContent("−3.0 kgSince Oct 1 (83.0 kg)")
        expect(tile("7-day average")).toHaveTextContent("80.5 kg")
        expect(tile("7-day average")).toHaveTextContent("−2.0 kg vs the 7 days before")
        expect(tile("Morning → night")).toHaveTextContent("+1.0 kgAverage daily swing over 1 day")
        expect(tile("Days weighed")).toHaveTextContent("4 of 90")
        expect(tile("Days weighed")).toHaveTextContent("3 mornings, 2 nights")
        expect(screen.getByRole("img", { name: "Morning and night weight per day, in kg" })).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Table" }))
        const rows = screen.getAllByRole("row")
        expect(rows[1]).toHaveTextContent("Wed, Oct 1480.0 kg81.0 kg+1.0 kg")
        expect(rows[2]).toHaveTextContent("Tue, Oct 1381.0 kg——")
        expect(rows).toHaveLength(5)
    })

    it("reloads for a different range", async () => {
        const urls = stubWeightApi([{ date: "2026-10-12", period: "night", weightKg: 90 }], "lb")
        render(<WeightStatsPage />)
        await screen.findByText("Latest")
        expect(screen.getByRole("radio", { name: "90 days" })).toHaveAttribute("aria-checked", "true")

        await userEvent.click(screen.getByRole("radio", { name: "30 days" }))
        await waitFor(() => expect(urls).toHaveLength(2))
        expect(urls[1]).toBe("/api/weight?from=2026-09-08&to=2026-10-14")
        expect(screen.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true")
        expect(await screen.findByText("Change over 30 days")).toBeInTheDocument()
        expect(screen.queryByRole("status")).not.toBeInTheDocument()

        // one night weigh-in, in pounds
        expect(tile("Latest")).toHaveTextContent("198.4 lbNight, Oct 12")
        expect(tile("Change over 30 days")).toHaveTextContent("—Needs two days of weigh-ins")
        expect(tile("Morning → night")).toHaveTextContent("—Log both on the same day to see this")
        expect(tile("7-day average")).toHaveTextContent("Last 7 days")
        expect(screen.getByRole("img", { name: "Morning and night weight per day, in lb" })).toBeInTheDocument()
    })

    it("only charts mornings when there are no night weigh-ins", async () => {
        stubWeightApi([{ date: "2026-10-14", period: "morning", weightKg: 80 }, { date: "2026-10-12", period: "morning", weightKg: 80 }])
        render(<WeightStatsPage />)
        expect(await screen.findByRole("img", { name: "Morning weight per day, in kg" })).toBeInTheDocument()
        expect(tile("Change over 90 days")).toHaveTextContent("±0.0 kg")
    })

    it("points to the diet page when nothing is logged", async () => {
        stubWeightApi([])
        render(<WeightStatsPage />)
        expect(await screen.findByText("No weigh-ins yet")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Go to My Diet" })).toHaveAttribute("href", "/mydiet")
    })

    it("says when the weigh-ins can't be loaded", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)))
        render(<WeightStatsPage />)
        expect(await screen.findByText("Couldn't load your weight")).toBeInTheDocument()
        expect(console.error).toHaveBeenCalledWith("Failed to load weight stats: ", expect.any(Error))
    })
})
