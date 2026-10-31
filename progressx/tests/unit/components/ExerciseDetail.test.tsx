// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ExerciseDetail from "@/app/internal_components/mystats/ExerciseDetail"
import ExerciseAnimation from "@/app/internal_components/mystats/ExerciseAnimation"
import ExerciseLibrary from "@/app/internal_components/mystats/ExerciseLibrary"
import MuscleMap from "@/app/internal_components/mystats/MuscleMap"
import { EXERCISES, EXERCISE_BY_ID } from "@/app/internal_components/mystats/exercises"
import { MOTIONS } from "@/app/internal_components/mystats/exerciseMotions"
import { day, makeSet, stubLayout } from "./workoutFixtures"

// three.js isn't loaded in tests: the 3D view's scene is replaced at the module boundary
const scene = vi.hoisted(() => ({ create: vi.fn(), dispose: vi.fn() }))
vi.mock("@/app/internal_components/mystats/exercise3dScene", () => ({
    createExercise3D: (...args: unknown[]) => {
        scene.create(...args)
        return { dispose: scene.dispose }
    },
}))

const webgl = (supported: boolean) => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue((supported ? {} : null) as never)

beforeEach(() => {
    stubLayout()
    scene.create.mockReset()
    scene.dispose.mockReset()
})

// whole user flows that render many charts and figures: can pass 5s when the full suite runs in parallel
describe("ExerciseDetail", { timeout: 20_000 }, () => {
    it("shows the 3D demo, form cues and muscles, and switches to 2D", async () => {
        webgl(true)
        const onClose = vi.fn()
        render(<ExerciseDetail exerciseId="barbell-bench-press" sets={[]} unit="kg" onClose={onClose} />)
        const dialog = screen.getByRole("dialog", { name: "Flat Barbell Bench Press" })
        const exercise = EXERCISE_BY_ID["barbell-bench-press"]

        const viewer = within(dialog).getByRole("img", { name: "Flat Barbell Bench Press demonstration (3D, drag to rotate)" })
        await waitFor(() => expect(within(viewer).getByText("Drag to rotate")).toBeInTheDocument())
        const options = scene.create.mock.calls[0][1]
        expect(options).toMatchObject({ motion: MOTIONS["bench-press"], motionId: "bench-press", primary: exercise.primary, secondary: exercise.secondary, reducedMotion: false })
        act(() => options.onInteract())
        expect(within(viewer).queryByText("Drag to rotate")).toBeNull()
        expect(within(viewer).getByText("Primary")).toBeInTheDocument()

        for (const cue of exercise.cues) expect(within(dialog).getByText(cue)).toBeInTheDocument()
        expect(within(dialog).getByText("Barbell")).toBeInTheDocument()
        expect(within(dialog).getByText("Chest")).toBeInTheDocument()
        expect(within(dialog).getByText("You haven't logged this exercise yet. Your records and weekly trend will show here.")).toBeInTheDocument()
        expect(within(dialog).queryByRole("button", { name: "Log it today" })).toBeNull()

        await userEvent.click(within(dialog).getByRole("radio", { name: "2D" }))
        expect(scene.dispose).toHaveBeenCalled()
        expect(within(dialog).getByRole("img", { name: "Flat Barbell Bench Press demonstration" })).toBeInTheDocument()

        await userEvent.click(within(dialog).getByRole("button", { name: "Close" }))
        expect(onClose).toHaveBeenCalled()
    })

    it("falls back to the 2D figure without WebGL", () => {
        webgl(false)
        render(<ExerciseDetail exerciseId="push-up" sets={[]} unit="kg" onClose={() => {}} />)
        expect(screen.getByRole("img", { name: "Push-Up demonstration" })).toBeInTheDocument()
        expect(screen.getByText("Bodyweight: log any added weight")).toBeInTheDocument()
        expect(scene.create).not.toHaveBeenCalled()
    })

    it("falls back to the 2D figure when the 3D scene fails to start", async () => {
        webgl(true)
        scene.create.mockImplementationOnce(() => { throw new Error("no GPU") })
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        render(<ExerciseDetail exerciseId="push-up" sets={[]} unit="kg" onClose={() => {}} />)
        expect(await screen.findByRole("img", { name: "Push-Up demonstration" })).toBeInTheDocument()
        expect(error).toHaveBeenCalled()
    })

    it("shows records and the weekly trend once the exercise is logged", async () => {
        webgl(false)
        const onLogToday = vi.fn()
        render(
            <ExerciseDetail
                exerciseId="barbell-bench-press"
                sets={[makeSet({ exercise_id: "barbell-bench-press", performed_on: day(7), weight_kg: 100, reps: 5 }), makeSet({ exercise_id: "barbell-bench-press", performed_on: day(1), weight_kg: 80, reps: 12 })]}
                unit="kg"
                onClose={() => {}}
                onLogToday={onLogToday}
            />,
        )
        expect(screen.getByText("Heaviest set").nextSibling).toHaveTextContent("100 kg × 5")
        expect(screen.getByText("Best estimated 1RM").nextSibling).toHaveTextContent("116.7 kg")
        expect(screen.getByText("Most reps in a set").nextSibling).toHaveTextContent("12 @ 80 kg")
        expect(screen.getByRole("img", { name: "Flat Barbell Bench Press: weekly best over the last 12 weeks" })).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Log it today" }))
        expect(onLogToday).toHaveBeenCalled()
    })

    it("tracks reps for bodyweight sets, and says when nothing is recent", () => {
        webgl(false)
        const { rerender } = render(<ExerciseDetail exerciseId="pull-up" sets={[makeSet({ exercise_id: "pull-up", performed_on: day(2), weight_kg: 0, reps: 9 })]} unit="lb" onClose={() => {}} />)
        expect(screen.queryByText("Heaviest set")).toBeNull()
        expect(screen.getByText("Most reps in a set").nextSibling).toHaveTextContent(/^9$/)

        rerender(<ExerciseDetail exerciseId="pull-up" sets={[makeSet({ exercise_id: "pull-up", performed_on: day(200), weight_kg: 10, reps: 9 })]} unit="lb" onClose={() => {}} />)
        expect(screen.getByText("Nothing logged in the last 12 weeks.")).toBeInTheDocument()
    })

    it("renders nothing for an unknown exercise", () => {
        const { container } = render(<ExerciseDetail exerciseId="nope" sets={[]} unit="kg" onClose={() => {}} />)
        expect(container).toBeEmptyDOMElement()
    })

    it("closes on Escape and on a backdrop click, and gives focus back to the opener", async () => {
        webgl(false)
        const onClose = vi.fn()
        const opener = document.createElement("button")
        document.body.appendChild(opener)
        opener.focus()
        const { unmount } = render(<ExerciseDetail exerciseId="push-up" sets={[]} unit="kg" onClose={onClose} />)
        const dialog = screen.getByRole("dialog")
        expect(dialog).toHaveFocus()

        await userEvent.click(dialog) // inside the dialog: stays open
        expect(onClose).not.toHaveBeenCalled()
        await userEvent.click(dialog.parentElement!)
        expect(onClose).toHaveBeenCalledTimes(1)
        await userEvent.keyboard("{Escape}")
        expect(onClose).toHaveBeenCalledTimes(2)

        unmount()
        expect(opener).toHaveFocus()
        opener.remove()
    })
})

describe("MuscleMap", () => {
    it("draws front and back views, with an optional legend", () => {
        const { rerender } = render(<MuscleMap primary={["chest"]} secondary={["chest", "triceps"]} />)
        expect(screen.getByText("Front")).toBeInTheDocument()
        expect(screen.getByText("Back")).toBeInTheDocument()
        expect(screen.getByText("Secondary")).toBeInTheDocument()
        rerender(<MuscleMap primary={["chest"]} secondary={[]} showLegend={false} />)
        expect(screen.queryByText("Secondary")).toBeNull()
    })
})

describe("ExerciseAnimation", () => {
    function stubFrames() {
        let observerCallback: IntersectionObserverCallback = () => {}
        const frames: FrameRequestCallback[] = []
        vi.stubGlobal("IntersectionObserver", class {
            constructor(callback: IntersectionObserverCallback) { observerCallback = callback }
            observe() {}
            disconnect() {}
        })
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
        const cancel = vi.fn()
        vi.stubGlobal("cancelAnimationFrame", cancel)
        const visible = (isIntersecting: boolean) => act(() => observerCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver))
        return { visible, frames, cancel }
    }

    const headY = (svg: Element) => Number(svg.querySelector("circle")!.getAttribute("cy"))

    it("animates only while on screen", () => {
        const { visible, frames, cancel } = stubFrames()
        render(<ExerciseAnimation motion="squat" label="Squat" stillAt={0} />)
        const svg = screen.getByRole("img", { name: "Squat" })
        const start = headY(svg)
        expect(frames).toHaveLength(0)

        visible(true)
        visible(true) // already playing: no second loop
        expect(frames).toHaveLength(1)
        frames[0](performance.now() + (MOTIONS["squat"].period ?? 2600) / 2) // halfway through the rep: the other pose
        expect(headY(svg)).not.toBeCloseTo(start)
        expect(frames).toHaveLength(2)

        visible(false)
        expect(cancel).toHaveBeenCalled()
    })

    it("holds still for reduced motion or when not playing", () => {
        const { visible, frames } = stubFrames()
        stubLayout({ reducedMotion: true })
        render(<ExerciseAnimation motion="squat" label="" />)
        expect(document.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
        render(<ExerciseAnimation motion="squat" label="Still" playing={false} />)
        visible(true)
        expect(frames).toHaveLength(0)
    })

    it("uses the fallback figure for an unknown motion and draws scenery without a floor where asked", () => {
        const { container } = render(<ExerciseAnimation motion="unknown" label="x" />)
        expect(container.querySelectorAll("line").length).toBeGreaterThan(0)
        const hanging = Object.entries(MOTIONS).find(([, motion]) => motion.floor === false && motion.scenery)![0]
        const { container: bar } = render(<ExerciseAnimation motion={hanging} label="hang" playing={false} />)
        expect(bar.querySelectorAll("path")).toHaveLength(MOTIONS[hanging].scenery!.length)
    })
})

// whole user flows that render many charts and figures: can pass 5s when the full suite runs in parallel
describe("ExerciseLibrary", { timeout: 20_000 }, () => {
    it("filters by search and muscle group and opens an exercise", async () => {
        const onOpen = vi.fn()
        render(<ExerciseLibrary onOpen={onOpen} />)
        expect(screen.getAllByRole("button", { name: /demonstration/ })).toHaveLength(EXERCISES.length)

        await userEvent.click(screen.getByRole("button", { name: "Core" }))
        const core = screen.getAllByRole("button", { name: /demonstration/ })
        expect(core.length).toBeLessThan(EXERCISES.length)
        expect(core.some((button) => button.textContent!.includes("Plank"))).toBe(true)
        await userEvent.click(screen.getByRole("button", { name: "Core" })) // again: back to all
        expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true")

        await userEvent.click(screen.getByRole("searchbox", { name: "Search exercises" }))
        await userEvent.paste("triceps")
        const triceps = screen.getAllByRole("button", { name: /demonstration/ })
        const found = triceps.map((button) => EXERCISES.find((e) => e.name === button.querySelector("p")!.textContent)!)
        expect(found.every((e) => [...e.primary, ...e.secondary].includes("triceps"))).toBe(true) // secondary muscles match too

        await userEvent.click(triceps[0])
        expect(onOpen).toHaveBeenCalledTimes(1)

        await userEvent.click(screen.getByRole("searchbox"))
        await userEvent.paste("qqq")
        expect(screen.getByText("No exercises match “tricepsqqq”.")).toBeInTheDocument()
    })

    it("lists exercises that mainly train the picked group first", async () => {
        render(<ExerciseLibrary onOpen={() => {}} />)
        await userEvent.click(screen.getByRole("button", { name: "Arms" }))
        const names = screen.getAllByRole("button", { name: /demonstration/ }).map((button) => button.querySelector("p")!.textContent!)
        const leads = names.map((name) => ["biceps", "triceps", "forearms"].includes(EXERCISES.find((e) => e.name === name)!.primary[0]))
        expect(leads.indexOf(false) === -1 || leads.slice(leads.indexOf(false)).every((lead) => !lead)).toBe(true)
    })
})
