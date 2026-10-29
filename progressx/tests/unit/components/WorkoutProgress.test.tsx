// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WorkoutProgress from "@/app/internal_components/mystats/WorkoutProgress"
import type { WeightUnit } from "@/app/internal_components/mystats/exercises"
import type { WorkoutSet } from "@/app/internal_components/mystats/workoutStats"
import { day, makeSet, stubLayout } from "./workoutFixtures"

beforeEach(() => stubLayout())

function setup(sets: WorkoutSet[], unit: WeightUnit = "kg") {
    const spies = { onOpenExercise: vi.fn(), onGoToLog: vi.fn() }
    render(<WorkoutProgress sets={sets} unit={unit} {...spies} />)
    return spies
}

const tile = (label: string) => screen.getByText(label).parentElement!

// whole user flows that render many charts and figures: can pass 5s when the full suite runs in parallel
describe("WorkoutProgress", { timeout: 20_000 }, () => {
    it("points new users to the log", async () => {
        const spies = setup([makeSet({ exercise_id: "not-an-exercise" })])
        expect(screen.getByText("No workouts logged yet")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Log a workout" }))
        expect(spies.onGoToLog).toHaveBeenCalled()
    })

    it("compares this week's best with the last week trained", () => {
        setup([
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(14), weight_kg: 95, reps: 5 }),
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(0), weight_kg: 100, reps: 5 }),
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(0), weight_kg: 90, reps: 8 }),
        ])
        expect(screen.getByRole("heading", { name: "Flat Barbell Bench Press" })).toBeInTheDocument()
        expect(within(tile("Best est. 1RM this week")).getByText("116.7")).toBeInTheDocument()
        expect(within(tile("Best est. 1RM this week")).getByText(/^\+5\.\d kg vs week of /)).toBeInTheDocument()
        expect(within(tile("Top set this week")).getByText(/^\+5 kg vs week of /)).toBeInTheDocument()
        expect(within(tile("Volume this week")).getByText(/^2 sets · 1 the week before$/)).toBeInTheDocument()

        expect(within(tile("Workouts this week")).getByText("1")).toBeInTheDocument()
        expect(within(tile("Workouts this week")).getByText("2 sets across all exercises")).toBeInTheDocument()
        expect(within(tile("Muscle groups trained this week")).getByText("1 of 7")).toBeInTheDocument()
        expect(within(tile("Workouts in the last 12 weeks")).getByText("2")).toBeInTheDocument()

        const records = screen.getByRole("region", { name: "Personal records" })
        expect(within(records).getByText("100 kg × 5")).toBeInTheDocument()
        expect(within(records).getByText("8 @ 90 kg")).toBeInTheDocument()
        expect(within(records).getByText("Biggest session")).toBeInTheDocument()

        expect(screen.getByRole("img", { name: "Flat Barbell Bench Press weekly strength trend" })).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Working sets per muscle group each week" })).toBeInTheDocument()
    })

    it("shows the latest trained week when this week has nothing yet, and says when nothing changed", () => {
        setup([
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(14), weight_kg: 100, reps: 5 }),
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(7), weight_kg: 100, reps: 5 }),
        ])
        expect(screen.getByText(/^Best est\. 1RM week of /)).toBeInTheDocument()
        expect(screen.getAllByText(/^no change vs week of /).length).toBeGreaterThanOrEqual(2)
        expect(within(tile("Workouts this week")).getByText("0")).toBeInTheDocument()
        expect(within(tile("Workouts this week")).getByText("0 sets across all exercises")).toBeInTheDocument()
    })

    it("tracks reps instead of weight for bodyweight exercises done without added weight", () => {
        setup([
            makeSet({ exercise_id: "push-up", performed_on: day(7), weight_kg: 0, reps: 12 }),
            makeSet({ exercise_id: "push-up", performed_on: day(0), weight_kg: 0, reps: 15 }),
        ])
        expect(within(tile("Most reps this week")).getByText("15")).toBeInTheDocument()
        expect(within(tile("Most reps this week")).getByText(/^\+3 reps vs week of /)).toBeInTheDocument()
        expect(within(tile("Volume this week")).getByText("15 reps")).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Reps trend" })).toBeInTheDocument()
        expect(screen.queryByText("Heaviest set")).toBeNull()
        expect(screen.queryByText("Best est. 1RM")).toBeNull()
    })

    it("switches exercise, range and table view, and opens the how-to", async () => {
        const spies = setup([
            makeSet({ exercise_id: "barbell-bench-press", performed_on: day(20), weight_kg: 100, reps: 5 }),
            makeSet({ exercise_id: "back-squat", performed_on: day(1), weight_kg: 140, reps: 3 }),
        ], "lb")
        // most recently trained first
        const select = screen.getByRole("combobox", { name: "Exercise" })
        expect(select).toHaveValue("back-squat")
        await userEvent.selectOptions(select, "barbell-bench-press")
        expect(screen.getByRole("heading", { name: "Flat Barbell Bench Press" })).toBeInTheDocument()
        expect(within(screen.getByRole("region", { name: "Personal records" })).getByText("220.5 lb × 5")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "How to do it" }))
        expect(spies.onOpenExercise).toHaveBeenCalledWith("barbell-bench-press")

        await userEvent.click(screen.getByRole("radio", { name: "8 weeks" }))
        expect(screen.getByRole("radio", { name: "8 weeks" })).toHaveAttribute("aria-checked", "true")
        expect(within(tile("Workouts in the last 8 weeks")).getByText("2")).toBeInTheDocument()

        const strength = screen.getByRole("heading", { name: "Strength trend" }).closest("section")!
        await userEvent.click(within(strength).getByRole("button", { name: "Table" }))
        expect(within(strength).getByRole("columnheader", { name: "Best est. 1RM" })).toBeInTheDocument()
        expect(within(strength).getAllByRole("row")).toHaveLength(2) // header + the one week trained

        const groups = screen.getByRole("heading", { name: "Sets per muscle group" }).closest("section")!
        await userEvent.click(within(groups).getByRole("button", { name: "Table" }))
        expect(within(groups).getByRole("rowheader", { name: "Chest" })).toBeInTheDocument()
    })
})
