// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { userDataContext } from "@/app/contexts/userData"
import DietStatsPage from "@/app/(main)/mystats/page"
import MyStatsLayout from "@/app/(main)/mystats/layout"
import type { ApiDay } from "@/app/internal_components/mystats/dietStats"
import { day, json, stubLayout, TODAY } from "./workoutFixtures"

const pathname = vi.hoisted(() => ({ current: "/mystats" }))
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }))

beforeEach(() => stubLayout())
afterEach(() => vi.unstubAllGlobals())

const profile = { weight: 180, height: 180, age: 30, gender: "male", activity: 3 }
const apiDay = (date: string, rest: Partial<ApiDay>): ApiDay =>
    ({ date, foods: 0, calories: 0, protein: 0, carbs: 0, fats: 0, micronutrients: {}, waterMl: 0, ...rest })

type Body = { days: ApiDay[], goalState?: string, displayedMicronutrients?: string[], customWaterGoalMl?: number | null }

function stubStats(body: Body | (() => Promise<Response>)) {
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        urls.push(url)
        if (typeof body === "function") return body()
        return json({ goalState: "Maintain", displayedMicronutrients: ["Iron", "Sodium"], customWaterGoalMl: null, ...body })
    }))
    return urls
}

function renderPage() {
    return render(
        <userDataContext.Provider value={{ userData: profile, setUserData: () => {} }}>
            <DietStatsPage />
        </userDataContext.Provider>,
    )
}

const tile = (label: string) => screen.getByText(label).parentElement!

// whole user flows that render many charts and figures: can pass 5s when the full suite runs in parallel
describe("Diet stats page", { timeout: 20_000 }, () => {
    it("compares this week's averages with last week's", async () => {
        const urls = stubStats({
            days: [
                apiDay(day(7), { foods: 3, calories: 1500, protein: 80, carbs: 150, fats: 50, waterMl: 1500, micronutrients: { Iron: 4, Sodium: 1500 } }),
                apiDay(day(0), { foods: 3, calories: 2600, protein: 140, carbs: 300, fats: 80, waterMl: 3000, micronutrients: { Iron: 12, Sodium: 4000 } }),
            ],
        })
        renderPage()
        expect(screen.getByRole("status", { name: "Loading your stats" })).toBeInTheDocument()
        expect(await screen.findByText("Avg daily score")).toBeInTheDocument()
        expect(urls[0]).toMatch(new RegExp(`^/api/stats/diet\\?from=\\d{4}-\\d{2}-\\d{2}&to=${TODAY}$`))

        expect(within(tile("Avg calories / day")).getByText("2,600")).toBeInTheDocument()
        expect(within(tile("Avg calories / day")).getByText(/^\+1,100 vs last week$/)).toBeInTheDocument()
        expect(within(tile("Avg protein / day")).getByText(/^\+60 g vs last week$/)).toBeInTheDocument()
        expect(within(tile("Avg water / day")).getByText(/ vs last week$/)).toBeInTheDocument()
        expect(within(tile("Avg daily score")).getByText(/ pts vs last week$/)).toBeInTheDocument()
        expect(within(tile("Days logged this week")).getByText("1")).toBeInTheDocument()
        expect(within(tile("Days logged this week")).getByText(/^2 days across 8 weeks$/)).toBeInTheDocument()

        expect(screen.getByRole("img", { name: /^Daily score over time, as a percentage\. \d+ of \d+ days have nothing logged\.$/ })).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Average daily calories per week" })).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Average daily protein per week" })).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Water score per week" })).toBeInTheDocument()

        // sodium is a limit: over it is flagged, iron is a share of the target
        const heatmap = screen.getByRole("img", { name: "Micronutrient intake per week as a share of target" })
        const sodium = within(heatmap).getAllByLabelText(/^Sodium, .+: 4,000 mg · \d+% of limit$/)
        expect(sodium).toHaveLength(1)
        expect(within(heatmap).getAllByLabelText(/^Sodium, .+: 1,500 mg · under the .+ mg limit$/)).toHaveLength(1)
        expect(within(heatmap).getAllByLabelText(/^Iron, .+: 12 mg · \d+% of target$/)).toHaveLength(1)
        expect(within(heatmap).getAllByLabelText(/^Iron, .+: Nothing logged$/).length).toBeGreaterThan(0)
        fireEvent.focus(sodium[0])
        expect(within(screen.getByRole("status")).getByText("Over limit")).toBeInTheDocument()
    })

    it("lists the logged days in the score table, newest first", async () => {
        stubStats({ days: [apiDay(day(8), { waterMl: 2000 }), apiDay(day(1), { foods: 1, calories: 2000, protein: 100 })] })
        renderPage()
        const card = (await screen.findByRole("heading", { name: "Daily score" })).closest("section")!
        await userEvent.click(within(card).getByRole("button", { name: "Table" }))
        const rows = within(card).getAllByRole("row").slice(1)
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent(new RegExp(`^${dayjsLabel(day(1))}`))
        expect(rows[1]).toHaveTextContent(new RegExp(`^${dayjsLabel(day(8))}`))
    })

    it("shows the empty state when nothing is logged, and refetches for another range", async () => {
        const urls = stubStats({ days: [] })
        renderPage()
        expect(await screen.findByText("No diet data yet")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Go to My Diet" })).toHaveAttribute("href", "/mydiet")

        await userEvent.click(screen.getByRole("radio", { name: "4 weeks" }))
        expect(screen.getByRole("radio", { name: "4 weeks" })).toHaveAttribute("aria-checked", "true")
        await waitFor(() => expect(urls).toHaveLength(2))
        expect(urls[1]).not.toBe(urls[0])
    })

    it("says so when the stats can't load", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        stubStats(async () => json({}, 500))
        renderPage()
        expect(await screen.findByText("Couldn't load your stats")).toBeInTheDocument()
    })

    it("explains how to pick micronutrients when none are tracked, and uses a custom water goal", async () => {
        stubStats({ days: [apiDay(day(0), { foods: 1, calories: 1800, waterMl: 1000 })], displayedMicronutrients: ["Not a nutrient"], customWaterGoalMl: 2500, goalState: "Deficit" })
        renderPage()
        expect(await screen.findByText(/^No micronutrients selected\./)).toBeInTheDocument()
        expect(within(tile("Avg water / day")).getByText(/^Goal 2(\.5 L|,500 ml)/i)).toBeInTheDocument()
        expect(screen.getByText(/calorie goal \(deficit\)/)).toBeInTheDocument()
        expect(within(tile("Avg daily score")).getByText("This week")).toBeInTheDocument() // nothing to compare with
    })
})

describe("My Stats layout", () => {
    it("marks the open tab in the section nav", () => {
        pathname.current = "/mystats/workouts"
        render(<MyStatsLayout><p>tab content</p></MyStatsLayout>)
        expect(screen.getByRole("heading", { name: "My Stats" })).toBeInTheDocument()
        expect(screen.getByText("tab content")).toBeInTheDocument()
        const nav = screen.getByRole("navigation", { name: "My Stats sections" })
        expect(within(nav).getByRole("link", { name: "Workouts" })).toHaveAttribute("aria-current", "page")
        expect(within(nav).getByRole("link", { name: "Diet" })).not.toHaveAttribute("aria-current")
        expect(within(nav).getByRole("link", { name: "Weight" })).toHaveAttribute("href", "/mystats/weight")
    })
})

function dayjsLabel(date: string) {
    const d = new Date(`${date}T12:00:00`)
    return `${d.toLocaleDateString("en-US", { weekday: "short" })}, ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`
}
