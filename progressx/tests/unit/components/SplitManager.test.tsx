// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import SplitManager from "@/app/internal_components/mystats/SplitManager"
import { MAX_SPLIT_DAYS, SPLIT_TEMPLATES } from "@/app/internal_components/mystats/exercises"
import type { WorkoutSplit } from "@/app/internal_components/mystats/workoutStats"
import { makeSplit, stubLayout } from "./workoutFixtures"

beforeEach(() => stubLayout())

const ppl = makeSplit({ id: "ppl", name: "PPL", is_active: true, days: [{ name: "Push", exercises: [{ exerciseId: "barbell-bench-press", sets: 3, reps: "5-8" }] }, { name: "Legs", exercises: [] }] })
const ul = makeSplit({ id: "ul", name: "Upper Lower", days: [{ name: "Upper", exercises: [{ exerciseId: "pull-up", sets: 3, reps: "6-10" }, { exerciseId: "plank", sets: 2, reps: "30" }] }] })

function setup(splits: WorkoutSplit[] = [ppl, ul], saveResult: string | null = null) {
    const spies = {
        onSave: vi.fn(async () => saveResult),
        onDelete: vi.fn(async () => {}),
        onActivate: vi.fn(async () => {}),
    }
    render(<SplitManager splits={splits} {...spies} />)
    return spies
}

// whole user flows that render many charts and figures: can pass 5s when the full suite runs in parallel
describe("SplitManager", { timeout: 20_000 }, () => {
    it("starts new users on the templates and saves a copy of the one they pick", async () => {
        const spies = setup([])
        expect(screen.getByText("Start from a template or build your own.")).toBeInTheDocument()
        const templates = screen.getByRole("region", { name: "New split" })
        expect(within(templates).queryByRole("button", { name: "Cancel" })).toBeNull() // nothing to go back to
        const template = SPLIT_TEMPLATES[0]

        await userEvent.click(within(templates).getByRole("button", { name: (accessibleName) => accessibleName.startsWith(template.name) && accessibleName.includes(template.description) }))
        const editor = screen.getByRole("region", { name: "New split" })
        expect(within(editor).getByRole("textbox", { name: "Split name" })).toHaveValue(template.name)
        await userEvent.click(within(editor).getByRole("button", { name: "Save split" }))

        expect(spies.onSave).toHaveBeenCalledWith({ id: null, name: template.name, days: template.days })
        expect((spies.onSave.mock.calls[0] as unknown as [{ days: unknown }])[0].days).not.toBe(template.days) // a copy, so editing can't change the template
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "Split name" })).toBeNull())
    })

    it("lists splits with their days, and activates or deletes them", async () => {
        const spies = setup()
        expect(screen.getByText("Your active split drives the workout suggested on the Log tab.")).toBeInTheDocument()
        const active = screen.getByRole("region", { name: "PPL" })
        expect(within(active).getByText("Active")).toBeInTheDocument()
        expect(within(active).queryByRole("button", { name: "Make active" })).toBeNull()
        expect(within(active).getByText("1 exercise")).toBeInTheDocument()
        expect(within(active).getByText("0 exercises")).toBeInTheDocument()

        const inactive = screen.getByRole("region", { name: "Upper Lower" })
        await userEvent.click(within(inactive).getByRole("button", { name: "Make active" }))
        expect(spies.onActivate).toHaveBeenCalledWith(ul)

        const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true)
        await userEvent.click(within(inactive).getByRole("button", { name: "Delete" }))
        expect(spies.onDelete).not.toHaveBeenCalled()
        await userEvent.click(within(inactive).getByRole("button", { name: "Delete" }))
        expect(confirm).toHaveBeenLastCalledWith(`Delete "Upper Lower"? Sets you've logged are kept.`)
        expect(spies.onDelete).toHaveBeenCalledWith(ul)
    })

    it("opens and cancels the template picker", async () => {
        setup()
        expect(screen.queryByRole("region", { name: "New split" })).toBeNull()
        await userEvent.click(screen.getByRole("button", { name: "New split" }))
        const templates = screen.getByRole("region", { name: "New split" })
        await userEvent.click(within(templates).getByRole("button", { name: "Cancel" }))
        expect(screen.queryByRole("region", { name: "New split" })).toBeNull()
    })

    it("edits a split: renames, reorders, removes and adds days and exercises", async () => {
        const spies = setup()
        await userEvent.click(within(screen.getByRole("region", { name: "Upper Lower" })).getByRole("button", { name: "Edit" }))
        const editor = screen.getByRole("region", { name: "Edit split" })

        const name = within(editor).getByRole("textbox", { name: "Split name" })
        await userEvent.clear(name)
        await userEvent.type(name, "UL")

        // exercises: reorder, change sets and reps, remove
        expect(within(editor).getByRole("button", { name: "Move Pull-Up up" })).toBeDisabled()
        expect(within(editor).getByRole("button", { name: "Move Plank down" })).toBeDisabled()
        await userEvent.click(within(editor).getByRole("button", { name: "Move Plank up" }))
        await userEvent.click(within(editor).getByRole("button", { name: "Move Plank down" }))
        await userEvent.click(within(editor).getByRole("button", { name: "Move Pull-Up down" }))

        const sets = within(editor).getByRole("textbox", { name: "Pull-Up sets" })
        await userEvent.clear(sets)
        await userEvent.type(sets, "25") // capped at 10
        expect(sets).toHaveValue("10")
        await userEvent.clear(sets)
        await userEvent.tab() // an empty sets field goes back to 1
        expect(sets).toHaveValue("1")
        const reps = within(editor).getByRole("textbox", { name: "Pull-Up reps" })
        await userEvent.clear(reps)
        await userEvent.type(reps, "AMRAP")

        // days: add, rename, reorder, remove
        await userEvent.click(within(editor).getByRole("button", { name: "+ Add day" }))
        const day2 = within(editor).getByRole("textbox", { name: "Day 2 name" })
        expect(day2).toHaveValue("Day 2")
        expect(within(editor).getByText("No exercises yet.")).toBeInTheDocument()
        await userEvent.clear(day2)
        await userEvent.type(day2, "Lower")
        await userEvent.click(within(editor).getByRole("button", { name: "Move Lower earlier" }))
        expect(within(editor).getByRole("textbox", { name: "Day 1 name" })).toHaveValue("Lower")
        await userEvent.click(within(editor).getByRole("button", { name: "Move Lower later" }))
        await userEvent.click(within(editor).getByRole("button", { name: "+ Add day" }))
        await userEvent.click(within(editor).getByRole("button", { name: "Remove Day 3" }))

        // add an exercise to the new day through the picker
        const addButtons = within(editor).getAllByRole("button", { name: "+ Add exercise" })
        await userEvent.click(addButtons[1])
        const picker = screen.getByRole("dialog", { name: "Add to Lower" })
        await userEvent.click(within(picker).getByRole("button", { name: "Legs" }))
        expect(within(picker).getByRole("button", { name: "Legs" })).toHaveAttribute("aria-pressed", "true")
        await userEvent.click(within(picker).getAllByRole("button", { name: /Quads/ })[0])
        expect(screen.queryByRole("dialog")).toBeNull()

        await userEvent.click(within(editor).getByRole("button", { name: "Remove Plank" }))
        await userEvent.click(within(editor).getByRole("button", { name: "Save split" }))

        const [ saved ] = spies.onSave.mock.calls[0] as unknown as [{ id: string, name: string, days: { name: string, exercises: { exerciseId: string, sets: number, reps: string }[] }[] }]
        expect(saved.id).toBe("ul")
        expect(saved.name).toBe("UL")
        expect(saved.days.map((d) => d.name)).toEqual(["Upper", "Lower"])
        expect(saved.days[0].exercises).toEqual([{ exerciseId: "pull-up", sets: 1, reps: "AMRAP" }])
        expect(saved.days[1].exercises).toEqual([expect.objectContaining({ sets: 3, reps: "8-12" })])
        // the split passed in wasn't changed while editing
        expect(ul.days[0].exercises).toHaveLength(2)
    })

    it("needs a split name and day names, and shows a save error", async () => {
        const spies = setup([ppl], "A split with that name already exists")
        await userEvent.click(screen.getByRole("button", { name: "Edit" }))
        const editor = screen.getByRole("region", { name: "Edit split" })
        const save = within(editor).getByRole("button", { name: "Save split" })

        await userEvent.clear(within(editor).getByRole("textbox", { name: "Split name" }))
        await userEvent.click(save)
        expect(within(editor).getByRole("alert")).toHaveTextContent("Give your split a name.")

        await userEvent.type(within(editor).getByRole("textbox", { name: "Split name" }), "PPL 2")
        await userEvent.clear(within(editor).getByRole("textbox", { name: "Day 1 name" }))
        await userEvent.click(save)
        expect(within(editor).getByRole("alert")).toHaveTextContent("Every day needs a name.")
        expect(spies.onSave).not.toHaveBeenCalled()

        await userEvent.type(within(editor).getByRole("textbox", { name: "Day 1 name" }), "Push")
        await userEvent.click(save)
        expect(await within(editor).findByRole("alert")).toHaveTextContent("A split with that name already exists")
        expect(screen.getByRole("region", { name: "Edit split" })).toBeInTheDocument() // still editing

        await userEvent.click(within(editor).getByRole("button", { name: "Cancel" }))
        expect(screen.getByRole("region", { name: "PPL" })).toBeInTheDocument()
    })

    it("starts a blank split with one day that can't be removed, up to the day limit", async () => {
        setup([])
        await userEvent.click(screen.getByRole("button", { name: /^Blank split/ }))
        const editor = screen.getByRole("region", { name: "New split" })
        expect(within(editor).getByRole("textbox", { name: "Split name" })).toHaveValue("My split")
        expect(within(editor).getByRole("button", { name: "Remove Day 1" })).toBeDisabled()
        const addDay = within(editor).getByRole("button", { name: "+ Add day" })
        for (let i = 1; i < MAX_SPLIT_DAYS; i++) await userEvent.click(addDay)
        expect(addDay).toBeDisabled()
    })
})
