// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import WorkoutsPage from "@/app/(main)/mystats/workouts/page"
import type { WorkoutSet, WorkoutSplit } from "@/app/internal_components/mystats/workoutStats"
import { day, json, makeSet, makeSplit, stubLayout, TODAY } from "./workoutFixtures"

beforeEach(() => {
    stubLayout()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null) // no WebGL: the detail view shows the 2D figure
    window.history.replaceState(null, "", "/mystats/workouts")
})
afterEach(() => vi.unstubAllGlobals())

type Call = { url: string, method: string, body: Record<string, unknown> | null }
type Handler = (call: Call) => Response | Promise<Response>

// A fake workouts API: GETs answer from the given data, writes go to `handlers` (method + path) or succeed
function stubApi({ splits = [] as WorkoutSplit[], sets = [] as WorkoutSet[], weightUnit = "lb", handlers = {} as Record<string, Handler>, fail = false } = {}) {
    const calls: Call[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null }
        calls.push(call)
        const path = url.split("?")[0]
        const handler = handlers[`${call.method} ${path}`]
        if (handler) return handler(call)
        if (call.method !== "GET") return json({})
        if (fail) return json({ message: "down" }, 500)
        if (path === "/api/workouts/splits") return json({ splits })
        if (path === "/api/workouts/sets") return json({ sets })
        if (path === "/api/user/settings") return json({ settings: { weightUnit } })
        return json({}, 404)
    }))
    return calls
}

const tab = (name: string) => screen.getByRole("tab", { name })

// whole user flows that render many charts and figures: can pass 5s when the full suite runs in parallel
describe("Workouts page", { timeout: 20_000 }, () => {
    it("loads splits, sets and the weight unit, and shows the log", async () => {
        const calls = stubApi({ weightUnit: "kg", sets: [{ ...makeSet({ exercise_id: "barbell-bench-press", performed_on: day(3) }), weight_kg: "100" as unknown as number }] })
        render(<WorkoutsPage />)
        expect(screen.getByRole("status", { name: "Loading your workouts" })).toBeInTheDocument()
        // placeholder shapes, not a spinner
        expect(screen.getByRole("status", { name: "Loading your workouts" }).querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0)
        expect(await screen.findByRole("tab", { name: "Log" })).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("radio", { name: "kg" })).toHaveAttribute("aria-checked", "true")
        expect(calls.find((c) => c.url.startsWith("/api/workouts/sets"))!.url).toContain(`to=${TODAY}`)
        expect(screen.getByRole("tabpanel", { name: "Log" })).toBeInTheDocument()
    })

    it("shows a retry when loading fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        stubApi({ fail: true })
        render(<WorkoutsPage />)
        expect(await screen.findByText("Couldn't load your workouts")).toBeInTheDocument()
        stubApi()
        await userEvent.click(screen.getByRole("button", { name: "Retry" }))
        expect(await screen.findByRole("tab", { name: "Log" })).toBeInTheDocument()
    })

    it("opens the tab named in the URL and remembers the tab picked", async () => {
        window.history.replaceState(null, "", "/mystats/workouts?tab=progress")
        stubApi()
        render(<WorkoutsPage />)
        expect(await screen.findByText("No workouts logged yet")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Log a workout" }))
        expect(tab("Log")).toHaveAttribute("aria-selected", "true")
        expect(window.location.search).toBe("?tab=log")

        await userEvent.click(tab("Exercises"))
        expect(window.location.search).toBe("?tab=exercises")
        expect(screen.getByRole("searchbox", { name: "Search exercises" })).toBeInTheDocument()
    })

    it("saves the weight unit, and puts it back if the save fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        let failSave = false
        const calls = stubApi({ handlers: { "PATCH /api/user/settings": () => failSave ? json({ message: "nope" }, 500) : json({}) } })
        render(<WorkoutsPage />)
        await userEvent.click(await screen.findByRole("radio", { name: "kg" }))
        expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: { weightUnit: "kg" } })
        expect(screen.getByRole("radio", { name: "kg" })).toHaveAttribute("aria-checked", "true")

        failSave = true
        await userEvent.click(screen.getByRole("radio", { name: "lb" }))
        await waitFor(() => expect(screen.getByRole("radio", { name: "kg" })).toHaveAttribute("aria-checked", "true"))
    })

    it("logs and deletes sets for the day", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        let deleteFails = true
        const calls = stubApi({
            handlers: {
                "POST /api/workouts/sets": (call) => json({ set: { ...makeSet({ exercise_id: String(call.body!.exerciseId) }), id: "new-set", weight_kg: "60", reps: call.body!.reps } }),
                "DELETE /api/workouts/sets/new-set": () => deleteFails ? json({ message: "nope" }, 500) : json({}),
            },
        })
        render(<WorkoutsPage />)
        await userEvent.click(await screen.findByRole("button", { name: "+ Add exercise" }))
        await userEvent.click(screen.getByRole("searchbox", { name: "Search exercises" }))
        await userEvent.paste("Flat Barbell")
        await userEvent.click(screen.getByRole("button", { name: /^Flat Barbell Bench Press/ }))

        const bench = screen.getByRole("article", { name: "Flat Barbell Bench Press" })
        await userEvent.type(within(bench).getByRole("textbox", { name: "Reps" }), "5")
        await userEvent.click(within(bench).getByRole("button", { name: "Log set" }))
        await waitFor(() => expect(within(bench).getByRole("button", { name: "Delete set 1" })).toBeInTheDocument())
        expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ exerciseId: "barbell-bench-press", reps: 5, performedOn: TODAY, splitId: null })

        await userEvent.click(within(bench).getByRole("button", { name: "Delete set 1" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete that set. Try again.")
        deleteFails = false
        await userEvent.click(within(bench).getByRole("button", { name: "Delete set 1" }))
        await waitFor(() => expect(within(bench).queryByRole("button", { name: "Delete set 1" })).toBeNull())
        expect(screen.queryByRole("alert")).toBeNull()
    })

    it("says when the server can't save a set", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        stubApi({ handlers: { "POST /api/workouts/sets": () => new Response("not json", { status: 500 }) } })
        render(<WorkoutsPage />)
        await userEvent.click(await screen.findByRole("button", { name: "+ Add exercise" }))
        await userEvent.click(screen.getAllByRole("button", { name: /^Flat Barbell Bench Press/ })[0])
        const bench = screen.getByRole("article", { name: "Flat Barbell Bench Press" })
        await userEvent.type(within(bench).getByRole("textbox", { name: "Reps" }), "5")
        await userEvent.click(within(bench).getByRole("button", { name: "Log set" }))
        expect(await within(bench).findByRole("alert")).toHaveTextContent("Couldn't save that set. Try again.")
    })

    it("replaces another workout's sets when switching the day", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const split = makeSplit({ id: "s1", is_active: true, days: [{ name: "A", exercises: [{ exerciseId: "barbell-bench-press", sets: 3, reps: "5" }] }, { name: "B", exercises: [{ exerciseId: "pull-up", sets: 3, reps: "5" }] }] })
        const logged = makeSet({ exercise_id: "barbell-bench-press", split_id: "s1", split_day_index: 0 })
        let fail = true
        stubApi({ splits: [split], sets: [logged], handlers: { "DELETE /api/workouts/sets": (call) => fail ? json({}, 500) : json({ deleted: call.body!.ids }) } })
        render(<WorkoutsPage />)
        await userEvent.selectOptions(await screen.findByRole("combobox"), "s1:1")
        await userEvent.click(screen.getByRole("button", { name: "Replace (remove 1 set)" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't remove those sets. Try again.")

        fail = false
        await userEvent.click(screen.getByRole("button", { name: "Replace (remove 1 set)" }))
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(screen.getByRole("combobox")).toHaveValue("s1:1")
        expect(screen.queryByRole("article", { name: "Flat Barbell Bench Press" })).toBeNull()
        expect(screen.getByRole("article", { name: "Pull-Up" })).toBeInTheDocument()
    })

    it("creates, edits, activates and deletes splits", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const first = makeSplit({ id: "s1", name: "First", is_active: true, days: [{ name: "A", exercises: [] }] })
        const second = makeSplit({ id: "s2", name: "Second", days: [{ name: "B", exercises: [] }] })
        let activateFails = true
        let deleteFails = true
        const calls = stubApi({
            splits: [first, second],
            sets: [makeSet({ exercise_id: "plank", split_id: "s2", split_day_index: 0, performed_on: day(1) })],
            handlers: {
                "POST /api/workouts/splits": (call) => json({ split: makeSplit({ id: "s3", name: String(call.body!.name), days: call.body!.days as WorkoutSplit["days"] }) }),
                "PATCH /api/workouts/splits/s1": (call) => json({ split: { ...first, name: String(call.body!.name) } }),
                "PATCH /api/workouts/splits/s2": () => activateFails ? json({ message: "nope" }, 500) : json({ split: { ...second, is_active: true } }),
                "DELETE /api/workouts/splits/s2": () => deleteFails ? json({}, 500) : json({}),
            },
        })
        render(<WorkoutsPage />)
        await userEvent.click(await screen.findByRole("tab", { name: "Splits" }))

        // new from a blank template
        await userEvent.click(screen.getByRole("button", { name: "New split" }))
        await userEvent.click(screen.getByRole("button", { name: /^Blank split/ }))
        await userEvent.click(screen.getByRole("button", { name: "Save split" }))
        expect(await screen.findByRole("region", { name: "My split" })).toBeInTheDocument()

        // rename
        await userEvent.click(within(screen.getByRole("region", { name: "First" })).getByRole("button", { name: "Edit" }))
        const name = screen.getByRole("textbox", { name: "Split name" })
        await userEvent.clear(name)
        await userEvent.type(name, "Renamed")
        await userEvent.click(screen.getByRole("button", { name: "Save split" }))
        expect(await screen.findByRole("region", { name: "Renamed" })).toBeInTheDocument()

        // activate: fails, then works
        await userEvent.click(within(screen.getByRole("region", { name: "Second" })).getByRole("button", { name: "Make active" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't switch your active split. Try again.")
        activateFails = false
        await userEvent.click(within(screen.getByRole("region", { name: "Second" })).getByRole("button", { name: "Make active" }))
        await waitFor(() => expect(within(screen.getByRole("region", { name: "Second" })).getByText("Active")).toBeInTheDocument())
        expect(within(screen.getByRole("region", { name: "Renamed" })).queryByText("Active")).toBeNull()

        // delete: fails, then works
        vi.spyOn(window, "confirm").mockReturnValue(true)
        await userEvent.click(within(screen.getByRole("region", { name: "Second" })).getByRole("button", { name: "Delete" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete that split. Try again.")
        deleteFails = false
        await userEvent.click(within(screen.getByRole("region", { name: "Second" })).getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(screen.queryByRole("region", { name: "Second" })).toBeNull())
        expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(2)
    })

    it("shows a split save error in the editor", async () => {
        stubApi({ handlers: { "POST /api/workouts/splits": () => json({ message: "Too many splits" }, 400) } })
        render(<WorkoutsPage />)
        await userEvent.click(await screen.findByRole("button", { name: "Create a split" }))
        expect(tab("Splits")).toHaveAttribute("aria-selected", "true")
        await userEvent.click(screen.getByRole("button", { name: /^Blank split/ }))
        await userEvent.click(screen.getByRole("button", { name: "Save split" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Too many splits")
    })

    it("opens an exercise from the library and logs it today", async () => {
        stubApi()
        render(<WorkoutsPage />)
        await userEvent.click(await screen.findByRole("tab", { name: "Exercises" }))
        await userEvent.click(screen.getByRole("button", { name: /^Push-Up demonstration/ }))
        const dialog = screen.getByRole("dialog", { name: "Push-Up" })
        await userEvent.click(within(dialog).getByRole("button", { name: "Log it today" }))
        expect(screen.queryByRole("dialog")).toBeNull()
        expect(tab("Log")).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("article", { name: "Push-Up" })).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "About Push-Up" }))
        await userEvent.click(within(screen.getByRole("dialog", { name: "Push-Up" })).getByRole("button", { name: "Close" }))
        expect(screen.queryByRole("dialog")).toBeNull()
    })
})
