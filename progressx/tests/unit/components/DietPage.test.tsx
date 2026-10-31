// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { userDataContext, UserData } from "@/app/contexts/userData"
import DietPage from "@/app/(main)/mydiet/page"

// these render the whole page and click through it, which can take a few seconds on a busy machine
vi.setConfig({ testTimeout: 15_000 })

// Wednesday 14 October 2026: only Date is faked, so timers (and user-event) still run normally
const TODAY = new Date(2026, 9, 14, 12)

const profile: UserData = { weight: 180, height: 180, age: 30, gender: "male", activity: 1 }

type Call = { url: string, method: string, body: Record<string, unknown> | null }
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function entry(id: string, name: string, extra: Record<string, unknown> = {}) {
    return {
        id, user_id: "u1", food_item_id: null, catalog_item_id: null, log_date: "2026-10-14", name,
        serving_qty: 1, serving_unit: "bowl", calories: 300, protein_g: 10, carbs_g: 50, fats_g: 5, fiber_g: 4,
        micronutrients: { Iron: 2 }, created_at: "2026-10-14T08:00:00Z", updated_at: "2026-10-14T08:00:00Z", ...extra,
    }
}

const catalogItem = (id: string, name: string) => ({
    id, name, serving_size: 2, serving_unit: "slice", calories: 200, protein_g: 8, carbs_g: 30, fats_g: 6, fiber_g: 2, micronutrients: { Sodium: 400 },
})

// Answers the diet page's API calls; tests override single routes ("METHOD /path") and read back what was sent
function stubApi(overrides: Record<string, Handler> = {}, initial: { entries?: unknown[], water?: unknown[], prefs?: Record<string, unknown> } = {}) {
    const calls: Call[] = []
    const routes: Record<string, Handler> = {
        "GET /api/diet/log": () => json({ entries: initial.entries ?? [] }),
        "GET /api/diet/water": () => json({ entries: initial.water ?? [], customGoalMl: null }),
        "GET /api/diet/preferences": () => json(initial.prefs ?? { goalState: "Maintain" }),
        "POST /api/diet/preferences": () => json({ ok: true }),
        "GET /api/weight": () => json({ entries: [], weightUnit: "lb" }),
        "GET /api/diet/food-items": () => json({ items: [] }),
        "GET /api/diet/log/summary": () => json({ loggedDates: ["2026-10-03"] }),
        ...overrides,
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET"
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
        const path = url.split("?")[0]
        const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.replace(/\/[^/]+$/, "/:id")}`]
        if (!handler) throw new Error(`unexpected ${method} ${url}`)
        return handler(url, init)
    })
    vi.stubGlobal("fetch", fetchMock)
    const sent = (method: string, path: string) => calls.filter((c) => c.method === method && c.url.split("?")[0] === path)
    return { calls, sent }
}

function renderPage(userData: UserData = profile) {
    return render(
        <userDataContext.Provider value={{ userData, setUserData: () => {} }}>
            <DietPage />
        </userDataContext.Provider>
    )
}

async function loaded() {
    await screen.findByRole("heading", { level: 1 })
}

const summary = () => within(screen.getByRole("region", { name: "Daily summary" }))

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(TODAY)
    vi.stubGlobal("matchMedia", () => ({ matches: true })) // reduced motion: no falling drop animation
    vi.spyOn(console, "error").mockImplementation(() => {})
    localStorage.clear()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("diet page loading", () => {
    it("waits for the day's log, water and preferences before showing the day", async () => {
        let releaseLog: (res: Response) => void = () => {}
        stubApi({ "GET /api/diet/log": () => new Promise<Response>((resolve) => { releaseLog = resolve }) })
        renderPage()
        expect(screen.getByRole("status", { name: "Loading your diet" })).toBeInTheDocument()
        // placeholder shapes, not a spinner
        expect(screen.getByRole("status", { name: "Loading your diet" }).querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0)

        releaseLog(json({ entries: [entry("e1", "Oatmeal")] }))
        expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
        expect(screen.getByText("Wednesday, October 14, 2026")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /^Oatmeal/ })).toBeInTheDocument()
    })

    it("still shows the page when every load fails", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
        renderPage()
        await loaded()
        expect(screen.getByText("No food logged yet for this day.")).toBeInTheDocument()
        expect(console.error).toHaveBeenCalledWith("Failed to load food log entries: ", expect.any(Error))
    })

    it("shows an empty water log when it can't be loaded", async () => {
        stubApi({ "GET /api/diet/water": () => json({}, 500) })
        renderPage()
        await loaded()
        expect(summary().getByText("0 ml")).toBeInTheDocument()
    })
})

describe("diet page summary", () => {
    it("totals the day's food and water against the profile's targets", async () => {
        stubApi({}, {
            entries: [entry("e1", "Oatmeal"), entry("e2", "Chicken", { calories: 250.4, protein_g: 40, micronutrients: { Sodium: 3000 } })],
            water: [{ id: "w1", user_id: "u1", log_date: "2026-10-14", amount_ml: 500, created_at: "2026-10-14T09:00:00Z" }],
        })
        renderPage()
        await loaded()

        expect(summary().getByText("550")).toBeInTheDocument() // 300 + 250.4 kCal, rounded
        expect(summary().getByText("of ~2,156 burned")).toBeInTheDocument()
        expect(summary().getByText("50")).toBeInTheDocument() // protein
        expect(summary().getByText("500 ml")).toBeInTheDocument()
        expect(summary().getByText("2")).toBeInTheDocument()
        expect(summary().getByText("foods")).toBeInTheDocument()
        expect(summary().getByText("1 drink today")).toBeInTheDocument()
        expect(screen.getByText("Maintenance")).toBeInTheDocument()
        expect(screen.getByText(/^Iron: 2\/[\d.]+ mg$/)).toBeInTheDocument()
        expect(screen.getByText("Sodium: 3000/2300 mg max")).toBeInTheDocument()
    })

    it("asks for profile details when it can't estimate a burn", async () => {
        stubApi()
        renderPage({ weight: null, gender: null })
        await loaded()
        expect(screen.getByText("Add your details to estimate burn")).toBeInTheDocument()
        expect(screen.getByText("Add your weight for a target")).toBeInTheDocument()
        expect(screen.getByText(/Add your height, weight, age and activity level/)).toBeInTheDocument()
        expect(summary().getByText("food", { exact: false })).toBeInTheDocument()
    })

    it("starts from the saved goal and saves each change to it", async () => {
        const api = stubApi({}, { prefs: { goalState: "Deficit", displayedMicronutrients: ["Iron"] } })
        renderPage()
        await loaded()

        expect(screen.getByText("Your target (deficit)")).toBeInTheDocument()
        expect(screen.getByText("1,656")).toBeInTheDocument()
        expect(screen.queryByText(/^Vitamin C:/)).not.toBeInTheDocument() // only the saved micros show

        await userEvent.click(screen.getByRole("button", { name: "Calorie goal: Deficit. Click to change" }))
        expect(screen.queryByText(/Your target/)).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Calorie goal: Maintain. Click to change" }))
        expect(screen.getByText("Your target (surplus)")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Calorie goal: Surplus. Click to change" }))
        expect(screen.getByRole("button", { name: "Calorie goal: Deficit. Click to change" })).toBeInTheDocument()

        expect(api.sent("POST", "/api/diet/preferences").map((c) => c.body)).toEqual([
            { goalState: "Maintain" }, { goalState: "Surplus" }, { goalState: "Deficit" },
        ])
    })

    it("keeps the new goal when saving it fails", async () => {
        stubApi({ "POST /api/diet/preferences": () => { throw new Error("offline") } })
        renderPage()
        await loaded()
        await userEvent.click(screen.getByRole("button", { name: "Calorie goal: Maintain. Click to change" }))
        expect(screen.getByRole("button", { name: "Calorie goal: Surplus. Click to change" })).toBeInTheDocument()
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to save goal state: ", expect.any(Error)))
    })
})

describe("diet page days", () => {
    it("moves between weeks and days, never past today", async () => {
        const api = stubApi()
        renderPage()
        await loaded()

        const next = screen.getByRole("button", { name: "Next week" })
        expect(next).toBeDisabled()
        expect(screen.getByRole("button", { name: "Th15" })).toBeDisabled()

        await userEvent.click(screen.getByRole("button", { name: "Previous week" }))
        expect(await screen.findByRole("heading", { level: 1, name: "Sunday" })).toBeInTheDocument()
        expect(screen.getByText("Sunday, October 4, 2026")).toBeInTheDocument()
        expect(api.sent("GET", "/api/diet/log").at(-1)?.url).toBe("/api/diet/log?date=2026-10-04")

        await userEvent.click(screen.getByRole("button", { name: "F9" }))
        expect(screen.getByRole("heading", { level: 1, name: "Friday" })).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Next week" }))
        expect(screen.getByText("Sunday, October 11, 2026")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled()
        expect(screen.getByText("0 drinks this day")).toBeInTheDocument()
    })

    it("jumps to a day from the month calendar, which marks the logged days", async () => {
        const api = stubApi()
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Open month calendar" }))
        expect(screen.getByText("October 2026")).toBeInTheDocument()
        await waitFor(() => expect(api.sent("GET", "/api/diet/log/summary").map((c) => c.url)).toEqual(["/api/diet/log/summary?month=2026-10"]))
        expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled()

        await userEvent.click(screen.getByRole("button", { name: "Previous month" }))
        expect(screen.getByText("September 2026")).toBeInTheDocument()
        await waitFor(() => expect(api.sent("GET", "/api/diet/log/summary").at(-1)?.url).toBe("/api/diet/log/summary?month=2026-09"))
        await userEvent.click(screen.getByRole("button", { name: "Next month" }))
        expect(screen.getByText("October 2026")).toBeInTheDocument()

        // the 3rd of October (the first "3" in the grid; the November one is in the future)
        const threes = screen.getAllByRole("button", { name: "3" })
        expect(threes.at(-1)).toBeDisabled()
        await userEvent.click(threes[0])
        expect(screen.queryByText("October 2026")).not.toBeInTheDocument()
        expect(screen.getByText("Saturday, October 3, 2026")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Open month calendar" }))
        await userEvent.click(screen.getByRole("button", { name: "Jump to today" }))
        expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
    })

    it("closes the month calendar with its button or the backdrop", async () => {
        stubApi({ "GET /api/diet/log/summary": () => { throw new Error("offline") } })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Open month calendar" }))
        await userEvent.click(screen.getByRole("button", { name: "Close" }))
        expect(screen.queryByText("October 2026")).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Open month calendar" }))
        await userEvent.click(screen.getByText("October 2026").closest("[role=presentation]")!)
        expect(screen.queryByText("October 2026")).not.toBeInTheDocument()
        expect(console.error).toHaveBeenCalledWith("Failed to load food log summary: ", expect.any(Error))
    })
})

describe("diet page food log", () => {
    it("logs a food added by hand to the day shown", async () => {
        const api = stubApi({ "POST /api/diet/log": () => json({ entry: entry("new", "Toast", { calories: 120 }) }) })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Add food" }))
        await userEvent.click(screen.getByRole("button", { name: "Add Manually" }))
        await userEvent.type(screen.getByLabelText("Name"), "Toast")
        await userEvent.type(screen.getByLabelText("Calories"), "120")
        await userEvent.click(screen.getByRole("checkbox", { name: /Save to my food catalog/ }))
        await userEvent.click(screen.getByRole("button", { name: "Add Item" }))

        expect(await screen.findByRole("button", { name: /^Toast/ })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Add food" })).toBeInTheDocument() // panel closed
        expect(api.sent("POST", "/api/diet/log")[0].body).toMatchObject({
            name: "Toast", calories: 120, servingQty: 1, servingUnit: "serving", logDate: "2026-10-14", foodItemId: null, saveToCatalog: true,
        })
    })

    it("keeps the form open when the food can't be saved", async () => {
        stubApi({ "POST /api/diet/log": () => json({}, 500) })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Add food" }))
        await userEvent.click(screen.getByRole("button", { name: "Add Manually" }))
        await userEvent.type(screen.getByLabelText("Name"), "Toast")
        await userEvent.click(screen.getByRole("button", { name: "Add Item" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to add food log entry"))
        expect(screen.getByLabelText("Name")).toHaveValue("Toast")

        await userEvent.click(screen.getByRole("button", { name: "Back" }))
        expect(screen.getByRole("button", { name: "Quick Add" })).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Close add food" }))
        expect(screen.getByText("No food logged yet for this day.")).toBeInTheDocument()
    })

    it("edits and deletes a logged food", async () => {
        const api = stubApi({
            "PATCH /api/diet/log/:id": (_url, init) => json({ entry: entry("e1", JSON.parse(String(init?.body)).name) }),
            "DELETE /api/diet/log/:id": () => json({ ok: true }),
        }, { entries: [entry("e1", "Oatmeal", { catalog_item_id: "c1" })] })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: /^Oatmeal/ }))
        expect(screen.getByText("In your Quick Add catalog")).toBeInTheDocument()
        const name = screen.getByLabelText("Name")
        expect(name).toHaveValue("Oatmeal")
        await userEvent.clear(name)
        await userEvent.type(name, "Porridge")
        await userEvent.click(screen.getByRole("button", { name: "Save Changes" }))

        expect(await screen.findByRole("button", { name: /^Porridge/ })).toBeInTheDocument()
        expect(api.sent("PATCH", "/api/diet/log/e1")[0].body).toMatchObject({ name: "Porridge", saveToCatalog: false })

        await userEvent.click(screen.getByRole("button", { name: /^Porridge/ }))
        await userEvent.click(screen.getByRole("button", { name: "Delete" }))
        expect(await screen.findByText("No food logged yet for this day.")).toBeInTheDocument()
        expect(api.sent("DELETE", "/api/diet/log/e1")).toHaveLength(1)
    })

    it("keeps the edit open when saving or deleting fails", async () => {
        stubApi({
            "PATCH /api/diet/log/:id": () => json({}, 500),
            "DELETE /api/diet/log/:id": () => { throw new Error("offline") },
        }, { entries: [entry("e1", "Oatmeal")] })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: /^Oatmeal/ }))
        await userEvent.click(screen.getByRole("button", { name: "Save Changes" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to update food log entry"))
        await userEvent.click(screen.getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to delete food log entry: ", expect.any(Error)))
        expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
        expect(screen.getByRole("button", { name: /^Oatmeal/ })).toBeInTheDocument()
    })

    it("reports an edit that can't reach the server, and a delete the server refuses", async () => {
        stubApi({
            "PATCH /api/diet/log/:id": () => { throw new Error("offline") },
            "DELETE /api/diet/log/:id": () => json({}, 500),
        }, { entries: [entry("e1", "Oatmeal")] })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: /^Oatmeal/ }))
        await userEvent.click(screen.getByRole("button", { name: "Save Changes" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to update food log entry: ", expect.any(Error)))
        await userEvent.click(screen.getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to delete food log entry"))
    })

    it("saves a food to Quick Add from the log, marking the same food logged earlier too", async () => {
        const api = stubApi({
            "PATCH /api/diet/log/:id": () => json({ entry: entry("e1", "Oatmeal", { catalog_item_id: "c9" }) }),
            "DELETE /api/diet/food-items/:id": () => json({ ok: true }),
        }, { entries: [entry("e1", "Oatmeal"), entry("e2", " oatmeal "), entry("e3", "Eggs")] })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Save Oatmeal to Quick Add" }))
        expect(await screen.findByRole("button", { name: "Remove Oatmeal from Quick Add" })).toHaveAttribute("aria-pressed", "true")
        expect(screen.getByRole("button", { name: "Remove oatmeal from Quick Add" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Save Eggs to Quick Add" })).toBeInTheDocument()
        expect(api.sent("PATCH", "/api/diet/log/e1")[0].body).toEqual({ saveToCatalog: true })
        expect(screen.getByRole("button", { name: "Add food" })).toBeInTheDocument() // the bookmark doesn't open the entry

        await userEvent.click(screen.getByRole("button", { name: "Remove Oatmeal from Quick Add" }))
        await waitFor(() => expect(screen.getAllByRole("button", { name: /^Save .* to Quick Add$/ })).toHaveLength(3))
        expect(api.sent("DELETE", "/api/diet/food-items/c9")).toHaveLength(1)
    })

    it("leaves the bookmark as it was when Quick Add can't be updated", async () => {
        stubApi({
            "PATCH /api/diet/log/:id": () => json({}, 500),
            "DELETE /api/diet/food-items/:id": () => json({}, 500),
        }, { entries: [entry("e1", "Oatmeal"), entry("e2", "Eggs", { catalog_item_id: "c2" })] })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Save Oatmeal to Quick Add" }))
        await waitFor(() => expect(screen.getByRole("button", { name: "Save Oatmeal to Quick Add" })).toBeEnabled())
        await userEvent.click(screen.getByRole("button", { name: "Remove Eggs from Quick Add" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledTimes(2))
        expect(screen.getByRole("button", { name: "Remove Eggs from Quick Add" })).toBeEnabled()
    })
})

describe("diet page Quick Add", () => {
    it("finds a saved food, scales it and logs it linked to the catalog item", async () => {
        const api = stubApi({
            "GET /api/diet/food-items": () => json({ items: [catalogItem("c1", "Pizza"), catalogItem("c2", "Bagel")] }),
            "POST /api/diet/log": () => json({ entry: entry("new", "Pizza", { calories: 400 }) }),
        })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Add food" }))
        await userEvent.click(screen.getByRole("button", { name: "Quick Add" }))
        expect(await screen.findByRole("button", { name: "Pizza" })).toBeInTheDocument()

        const search = screen.getByRole("searchbox", { name: "Search saved foods" })
        await userEvent.type(search, "zzz")
        expect(screen.getByText(/No saved foods match/)).toHaveTextContent("No saved foods match “zzz”")
        await userEvent.type(search, "{Escape}")
        expect(search).toHaveValue("")
        await userEvent.type(search, "bag")
        expect(screen.queryByRole("button", { name: "Pizza" })).not.toBeInTheDocument()
        await userEvent.clear(search)

        await userEvent.click(screen.getByRole("button", { name: "Pizza" }))
        expect(screen.getByText("1 slice serving = 200 kcal")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
        await userEvent.click(screen.getByRole("button", { name: "Pizza" }))
        await userEvent.click(screen.getByRole("button", { name: "Increase value" }))
        await userEvent.click(screen.getByRole("button", { name: "Add Item" }))

        expect(await screen.findByRole("button", { name: /^Pizza/ })).toBeInTheDocument()
        expect(api.sent("POST", "/api/diet/log")[0].body).toMatchObject({
            name: "Pizza", servingQty: 2.5, servingUnit: "slice", calories: 250, foodItemId: "c1", saveToCatalog: false,
        })
    })

    it("says when nothing is saved yet, and goes back to the add options", async () => {
        stubApi({ "GET /api/diet/food-items": () => { throw new Error("offline") } })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Add food" }))
        await userEvent.click(screen.getByRole("button", { name: "Quick Add" }))
        expect(await screen.findByText(/No saved items yet/)).toBeInTheDocument()
        expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Back" }))
        expect(screen.getByRole("button", { name: "Add Manually" })).toBeInTheDocument()
    })

    it("remembers whether the assistant was left open", async () => {
        localStorage.setItem("dietAssistantOpen", "true")
        stubApi()
        renderPage()
        await loaded()
        await userEvent.click(screen.getByRole("button", { name: "Add food" }))
        await userEvent.click(screen.getByRole("button", { name: "Quick Add" }))

        const toggle = screen.getByRole("button", { name: /Describe it instead/ })
        expect(toggle).toHaveAttribute("aria-expanded", "true")
        await userEvent.click(toggle)
        expect(toggle).toHaveAttribute("aria-expanded", "false")
        expect(localStorage.getItem("dietAssistantOpen")).toBe("false")
    })
})

describe("diet page water", () => {
    const water = (id: string, amount: number, at: string) => ({ id, user_id: "u1", log_date: "2026-10-14", amount_ml: amount, created_at: at })

    it("adds a glass straight away and keeps the saved entry", async () => {
        const api = stubApi({ "POST /api/diet/water": () => json({ entry: water("w9", 250, "2026-10-14T10:00:00Z") }) })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: /Glass/ }))
        expect(summary().getByText("250 ml")).toBeInTheDocument()
        expect(api.sent("POST", "/api/diet/water")[0].body).toEqual({ amountMl: 250, logDate: "2026-10-14" })
        expect(await screen.findByRole("button", { name: "Undo 250 ml" })).toBeInTheDocument()
    })

    it("takes the drink back off when it can't be saved", async () => {
        stubApi({ "POST /api/diet/water": () => json({}, 500) })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: /Bottle/ }))
        await waitFor(() => expect(summary().getByText("0 ml")).toBeInTheDocument())
        expect(console.error).toHaveBeenCalledWith("Failed to add water: ", expect.any(Error))
    })

    it("undoes the last drink, and puts it back in order if that fails", async () => {
        let undoOk = false
        const api = stubApi(
            { "DELETE /api/diet/water/:id": () => json({}, undoOk ? 200 : 500) },
            { water: [water("w1", 250, "2026-10-14T08:00:00Z"), water("w2", 500, "2026-10-14T09:00:00Z")] },
        )
        renderPage()
        await loaded()
        expect(screen.getByText(/custom goal|based on your weight/)).toHaveTextContent("based on your weight & activity")

        await userEvent.click(screen.getByRole("button", { name: "Undo 500 ml" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to undo water: ", expect.any(Error)))
        expect(screen.getByRole("button", { name: "Undo 500 ml" })).toBeInTheDocument()

        undoOk = true
        await userEvent.click(screen.getByRole("button", { name: "Undo 500 ml" }))
        expect(await screen.findByRole("button", { name: "Undo 250 ml" })).toBeInTheDocument()
        expect(api.sent("DELETE", "/api/diet/water/w2")).toHaveLength(2)
    })

    it("doesn't undo a drink that's still saving", async () => {
        const api = stubApi({ "POST /api/diet/water": () => new Promise<Response>(() => {}) })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: /Glass/ }))
        await userEvent.click(screen.getByRole("button", { name: "Undo 250 ml" }))
        expect(summary().getByText("250 ml")).toBeInTheDocument()
        expect(api.calls.some((c) => c.method === "DELETE")).toBe(false)
    })

    it("uses a custom water goal from Settings", async () => {
        stubApi({ "GET /api/diet/water": () => json({ entries: [], customGoalMl: 3000 }) })
        renderPage()
        await loaded()
        expect(screen.getByText("Goal 3 L · your custom goal")).toBeInTheDocument()
    })
})

describe("diet page micronutrient settings", () => {
    it("saves the chosen micronutrients and shows only those", async () => {
        const api = stubApi()
        renderPage()
        await loaded()
        expect(screen.getByText(/^Vitamin C:/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Choose displayed micronutrients" }))
        await userEvent.click(screen.getByRole("checkbox", { name: "Vitamin C" }))
        await userEvent.click(screen.getByRole("checkbox", { name: "Vitamin C" }))
        await userEvent.click(screen.getByRole("checkbox", { name: "Iron" }))
        await userEvent.click(screen.getByRole("button", { name: "Save" }))

        expect(screen.queryByText("Choose Displayed Micronutrients")).not.toBeInTheDocument()
        expect(screen.queryByText(/^Iron:/)).not.toBeInTheDocument()
        expect(screen.getByText(/^Vitamin C:/)).toBeInTheDocument()
        const saved = api.sent("POST", "/api/diet/preferences")[0].body?.displayedMicronutrients as string[]
        expect(saved).toContain("Vitamin C")
        expect(saved).not.toContain("Iron")
    })

    it("closes without saving from Cancel or the backdrop, and survives a failed save", async () => {
        const api = stubApi({ "POST /api/diet/preferences": () => { throw new Error("offline") } })
        renderPage()
        await loaded()

        await userEvent.click(screen.getByRole("button", { name: "Choose displayed micronutrients" }))
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
        expect(screen.queryByText("Choose Displayed Micronutrients")).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Choose displayed micronutrients" }))
        await userEvent.click(screen.getByText("Choose Displayed Micronutrients").closest("[role=presentation]")!)
        expect(screen.queryByText("Choose Displayed Micronutrients")).not.toBeInTheDocument()
        expect(api.sent("POST", "/api/diet/preferences")).toHaveLength(0)

        await userEvent.click(screen.getByRole("button", { name: "Choose displayed micronutrients" }))
        await userEvent.click(screen.getByRole("button", { name: "Save" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Failed to save diet preferences: ", expect.any(Error)))
    })
})
