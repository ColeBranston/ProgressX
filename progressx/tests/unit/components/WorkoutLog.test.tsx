// @vitest-environment jsdom
import { useState } from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WorkoutLog, { type NewSet } from "@/app/internal_components/mystats/WorkoutLog"
import { LB_PER_KG, WeightUnit } from "@/app/internal_components/mystats/exercises"
import type { WorkoutSet, WorkoutSplit } from "@/app/internal_components/mystats/workoutStats"
import { day, makeSet, makeSplit, stubLayout, TODAY } from "./workoutFixtures"

beforeEach(() => stubLayout())

const ppl = makeSplit({
    id: "ppl",
    name: "PPL",
    is_active: true,
    days: [
        { name: "Push", exercises: [{ exerciseId: "barbell-bench-press", sets: 3, reps: "5-8" }, { exerciseId: "push-up", sets: 2, reps: "10-15" }] },
        { name: "Pull", exercises: [{ exerciseId: "pull-up", sets: 3, reps: "6-10" }] },
    ],
})
const other = makeSplit({ id: "ul", name: "Upper Lower", days: [{ name: "Upper", exercises: [{ exerciseId: "plank", sets: 3, reps: "30-60" }] }] })

type Options = { splits?: WorkoutSplit[], sets?: WorkoutSet[], unit?: WeightUnit, date?: string, addResult?: boolean, deleteSetsResult?: boolean }

function setup({ splits = [ppl, other], sets = [], unit = "lb", date = TODAY, addResult = true, deleteSetsResult = true }: Options = {}) {
    const spies = {
        onAddSet: vi.fn<(set: NewSet) => Promise<boolean>>(async () => addResult),
        onDeleteSet: vi.fn(async () => {}),
        onDeleteSets: vi.fn(async () => deleteSetsResult),
        onOpenExercise: vi.fn(),
        onGoToSplits: vi.fn(),
        onAddExtra: vi.fn(),
        onDateChange: vi.fn(),
        onChoiceChange: vi.fn(),
    }
    function Harness() {
        const [ current, setCurrent ] = useState(date)
        const [ choice, setChoice ] = useState<string | undefined>()
        const [ extras, setExtras ] = useState<string[]>([])
        return (
            <WorkoutLog
                date={current}
                onDateChange={(next) => { spies.onDateChange(next); setCurrent(next) }}
                choice={choice}
                onChoiceChange={(next) => { spies.onChoiceChange(next); setChoice(next) }}
                splits={splits}
                sets={sets}
                unit={unit}
                extraExercises={extras}
                onAddExtra={(id) => { spies.onAddExtra(id); setExtras((prev) => [...prev, id]) }}
                onAddSet={spies.onAddSet}
                onDeleteSet={spies.onDeleteSet}
                onDeleteSets={spies.onDeleteSets}
                onOpenExercise={spies.onOpenExercise}
                onGoToSplits={spies.onGoToSplits}
            />
        )
    }
    render(<Harness />)
    return spies
}

const card = (name: string) => screen.getByRole("article", { name })

// whole user flows that render many charts and figures: can pass 5s when the full suite runs in parallel
describe("WorkoutLog", { timeout: 20_000 }, () => {
    it("plans the active split's next day and logs sets against it", async () => {
        const spies = setup()
        expect(screen.getByText("Today")).toBeInTheDocument()
        expect(screen.getByRole("combobox")).toHaveValue("ppl:0")
        expect(screen.getByText("0 of 5 planned sets logged")).toBeInTheDocument()
        expect(card("Push-Up")).toBeInTheDocument()

        const bench = card("Flat Barbell Bench Press")
        expect(within(bench).getByText("0/3 sets · 5-8 reps")).toBeInTheDocument()
        await userEvent.type(within(bench).getByRole("textbox", { name: "Weight in lb" }), "225")
        await userEvent.type(within(bench).getByRole("textbox", { name: "Reps" }), "5")
        await userEvent.click(within(bench).getByRole("button", { name: "Log set" }))

        expect(spies.onAddSet).toHaveBeenCalledTimes(1)
        expect(spies.onAddSet.mock.calls[0][0]).toMatchObject({ exerciseId: "barbell-bench-press", reps: 5, splitId: "ppl", splitDayIndex: 0 })
        expect(spies.onAddSet.mock.calls[0][0].weightKg).toBeCloseTo(225 / LB_PER_KG)
    })

    it("rotates to the day after the last one done", () => {
        setup({ sets: [makeSet({ exercise_id: "barbell-bench-press", performed_on: day(2), split_id: "ppl", split_day_index: 0 })] })
        expect(screen.getByRole("combobox")).toHaveValue("ppl:1")
        expect(card("Pull-Up")).toBeInTheDocument()
    })

    it("checks the weight and reps before saving", async () => {
        const spies = setup({ unit: "kg" })
        const bench = card("Flat Barbell Bench Press")
        const weight = within(bench).getByRole("textbox", { name: "Weight in kg" })
        const reps = within(bench).getByRole("textbox", { name: "Reps" })
        const log = within(bench).getByRole("button", { name: "Log set" })
        expect(log).toBeDisabled() // no reps yet

        await userEvent.type(weight, "1001")
        await userEvent.type(reps, "5")
        await userEvent.click(log)
        expect(within(bench).getByRole("alert")).toHaveTextContent("Weight must be 0 to 1000 kg.")

        await userEvent.clear(weight)
        await userEvent.clear(reps)
        await userEvent.type(reps, "0")
        await userEvent.click(log)
        expect(within(bench).getByRole("alert")).toHaveTextContent("Reps must be a whole number from 1 to 600.")

        await userEvent.clear(reps)
        await userEvent.type(reps, "x8") // letters are dropped as you type
        expect(reps).toHaveValue("8")
        await userEvent.click(log)
        expect(spies.onAddSet.mock.calls[0][0]).toMatchObject({ weightKg: 0, reps: 8 }) // an empty weight logs 0
        expect(within(bench).queryByRole("alert")).toBeNull()
    })

    it("says when a set couldn't be saved", async () => {
        setup({ addResult: false })
        const bench = card("Flat Barbell Bench Press")
        await userEvent.type(within(bench).getByRole("textbox", { name: "Reps" }), "5")
        await userEvent.click(within(bench).getByRole("button", { name: "Log set" }))
        expect(await within(bench).findByRole("alert")).toHaveTextContent("Couldn't save that set. Try again.")
    })

    it("shows last time, suggests the next step and prefills from it", () => {
        const before = [
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(3), weight_kg: 100, reps: 8 }),
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(3), weight_kg: 100, reps: 8 }),
        ]
        setup({ sets: before })
        const bench = card("Flat Barbell Bench Press")
        expect(within(bench).getByText(/^Last time \(.+\): 220\.5 lb × 8, 220\.5 lb × 8$/)).toBeInTheDocument()
        expect(within(bench).getByText("You hit 8+ reps on every set last time. Try 225.5 lb today.")).toBeInTheDocument()
        expect(within(bench).getByRole("textbox", { name: "Weight in lb" })).toHaveValue("220.5")
        expect(within(bench).getByRole("textbox", { name: "Reps" })).toHaveValue("8")
    })

    it("lists today's sets with a PR badge and deletes them", async () => {
        const today = makeSet({ exercise_id: "barbell-bench-press", weight_kg: 110, reps: 8, split_id: "ppl", split_day_index: 0 })
        const spies = setup({ sets: [makeSet({ exercise_id: "barbell-bench-press", performed_on: day(7), weight_kg: 100, reps: 8 }), today] })
        const bench = card("Flat Barbell Bench Press")
        expect(within(bench).getByText("PR")).toBeInTheDocument()
        expect(within(bench).getByText("1/3 sets · 5-8 reps")).toBeInTheDocument()
        expect(within(bench).getByText(/^e1RM /)).toBeInTheDocument()
        expect(screen.getByText("1 of 5 planned sets logged")).toBeInTheDocument()
        // today's sets already happened, so no suggestion
        expect(within(bench).queryByText(/Add a rep|You hit/)).toBeNull()

        await userEvent.click(within(bench).getByRole("button", { name: "Delete set 1" }))
        expect(spies.onDeleteSet).toHaveBeenCalledWith(today)
    })

    it("logs bodyweight exercises as added weight, and planks in seconds", () => {
        setup({
            splits: [{ ...other, is_active: true }],
            sets: [makeSet({ exercise_id: "push-up", weight_kg: 0, reps: 15 })],
        })
        const pushUp = card("Push-Up") // logged today outside the split, so it's still listed
        expect(within(pushUp).getByText("Bodyweight × 15")).toBeInTheDocument()
        expect(within(pushUp).getByText("+lb")).toBeInTheDocument()
        expect(within(card("Plank")).getByText("sec")).toBeInTheDocument()
    })

    it("asks before switching a day that already has sets from another workout", async () => {
        const logged = makeSet({ exercise_id: "barbell-bench-press", split_id: "ppl", split_day_index: 0 })
        const spies = setup({ sets: [logged] })
        const select = screen.getByRole("combobox")
        expect(select).toHaveValue("ppl:0") // what was logged today wins

        await userEvent.selectOptions(select, "ppl:1")
        const dialog = screen.getByRole("alertdialog", { name: "Switch this day to Pull?" })
        expect(dialog).toHaveTextContent("You already logged 1 set for Push on this day.")
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
        expect(screen.queryByRole("alertdialog")).toBeNull()
        expect(spies.onChoiceChange).not.toHaveBeenCalled()

        await userEvent.selectOptions(select, "ul:0")
        await userEvent.click(within(screen.getByRole("alertdialog", { name: "Switch this day to Upper?" })).getByRole("button", { name: "Keep them too" }))
        expect(spies.onChoiceChange).toHaveBeenLastCalledWith("ul:0")
        expect(spies.onDeleteSets).not.toHaveBeenCalled()
        expect(card("Plank")).toBeInTheDocument()
        expect(card("Flat Barbell Bench Press")).toBeInTheDocument() // kept, listed as an extra

        await userEvent.selectOptions(select, "freestyle") // freestyle sets aren't a conflict... but the push sets are
        await userEvent.click(within(screen.getByRole("alertdialog", { name: "Switch this day to Freestyle?" })).getByRole("button", { name: "Replace (remove 1 set)" }))
        await waitFor(() => expect(spies.onChoiceChange).toHaveBeenLastCalledWith("freestyle"))
        expect(spies.onDeleteSets).toHaveBeenCalledWith([logged])
    })

    it("stays on the dialog when removing the sets fails", async () => {
        const spies = setup({ sets: [makeSet({ exercise_id: "barbell-bench-press", split_id: "ppl", split_day_index: 0 }), makeSet({ exercise_id: "barbell-bench-press", split_id: "ppl", split_day_index: 0 })], deleteSetsResult: false })
        await userEvent.selectOptions(screen.getByRole("combobox"), "ppl:1")
        const dialog = screen.getByRole("alertdialog")
        expect(dialog).toHaveTextContent("You already logged 2 sets for Push")
        await userEvent.click(within(dialog).getByRole("button", { name: "Replace (remove 2 sets)" }))
        await waitFor(() => expect(spies.onDeleteSets).toHaveBeenCalled())
        expect(screen.getByRole("alertdialog")).toBeInTheDocument()
        expect(spies.onChoiceChange).not.toHaveBeenCalled()
    })

    it("switches straight away when there's nothing to conflict with", async () => {
        const spies = setup()
        await userEvent.selectOptions(screen.getByRole("combobox"), "ppl:1")
        expect(spies.onChoiceChange).toHaveBeenCalledWith("ppl:1")
        expect(screen.queryByRole("alertdialog")).toBeNull()
    })

    it("moves between days but not into the future", async () => {
        const spies = setup({ date: day(1) })
        expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled()
        await userEvent.click(screen.getByRole("button", { name: "Previous day" }))
        expect(spies.onDateChange).toHaveBeenLastCalledWith(day(2))
        await userEvent.click(screen.getByRole("button", { name: "Jump to today" }))
        expect(spies.onDateChange).toHaveBeenLastCalledWith(TODAY)
        expect(screen.getByText("Today")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled()
        expect(screen.queryByRole("button", { name: "Jump to today" })).toBeNull()

        await userEvent.click(screen.getByRole("button", { name: "Previous day" }))
        await userEvent.click(screen.getByRole("button", { name: "Next day" }))
        expect(spies.onDateChange).toHaveBeenLastCalledWith(TODAY)
    })

    it("offers to set up a split, and adds exercises from the picker", async () => {
        const spies = setup({ splits: [] })
        expect(screen.getByText("Nothing planned for this day. Add an exercise to start logging.")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Create a split" }))
        expect(spies.onGoToSplits).toHaveBeenCalled()

        await userEvent.click(screen.getByRole("button", { name: "+ Add exercise" }))
        const picker = screen.getByRole("dialog", { name: "Add an exercise" })
        const search = within(picker).getByRole("searchbox", { name: "Search exercises" })
        expect(search).toHaveFocus()

        await userEvent.click(search)
        await userEvent.paste("zzzz")
        expect(within(picker).getByText("No exercises match “zzzz”.")).toBeInTheDocument()
        await userEvent.clear(search)
        await userEvent.click(search)
        await userEvent.paste("pull-up")
        await userEvent.click(within(picker).getByRole("button", { name: /^Pull-Up/ }))
        expect(spies.onAddExtra).toHaveBeenCalledWith("pull-up")
        expect(screen.queryByRole("dialog")).toBeNull()
        expect(card("Pull-Up")).toBeInTheDocument()

        // already on the list: shown, but can't be picked twice
        await userEvent.click(screen.getByRole("button", { name: "+ Add exercise" }))
        const again = screen.getByRole("dialog", { name: "Add an exercise" })
        await userEvent.click(within(again).getByRole("button", { name: "Back" }))
        const pullUp = within(again).getByRole("button", { name: /^Pull-Up/ })
        expect(pullUp).toHaveAttribute("aria-disabled", "true")
        expect(pullUp).toHaveTextContent("Already added")
        await userEvent.click(pullUp)
        expect(spies.onAddExtra).toHaveBeenCalledTimes(1)
        await userEvent.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("opens the exercise details from its thumbnail", async () => {
        const spies = setup()
        await userEvent.click(screen.getByRole("button", { name: "About Push-Up" }))
        expect(spies.onOpenExercise).toHaveBeenCalledWith("push-up")
    })
})
