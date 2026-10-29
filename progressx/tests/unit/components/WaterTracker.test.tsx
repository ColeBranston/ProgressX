// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import WaterTracker, { formatVolume, WaterLogEntry } from "@/app/internal_components/mydiet/WaterTracker"

const drink = (id: string, amount: number): WaterLogEntry => ({ id, user_id: "u1", log_date: "2026-10-14", amount_ml: amount, created_at: "2026-10-14T08:00:00Z" })

function reducedMotion(matches: boolean) {
    vi.stubGlobal("matchMedia", () => ({ matches }))
}

beforeEach(() => reducedMotion(true))
afterEach(() => vi.unstubAllGlobals())

describe("formatVolume", () => {
    it("shows millilitres under a litre and trims litres", () => {
        expect(formatVolume(249.6)).toBe("250 ml")
        expect(formatVolume(1000)).toBe("1 L")
        expect(formatVolume(1500)).toBe("1.5 L")
        expect(formatVolume(2750)).toBe("2.75 L")
    })
})

describe("WaterTracker", () => {
    it("shows how much is left to the goal", () => {
        render(<WaterTracker entries={[drink("a", 250), drink("b", 500)]} targetMl={3000} onAdd={() => {}} onUndo={() => {}} />)
        expect(screen.getByRole("img", { name: "Water: 750 ml of 3 L (25%)" })).toBeInTheDocument()
        expect(screen.getByText("25% · 2.25 L to go")).toBeInTheDocument()
        expect(screen.getByText("2 drinks logged")).toBeInTheDocument()
        expect(screen.getByText("Goal 3 L · based on your weight & activity")).toBeInTheDocument()
    })

    it("says when the goal is reached, and copes with no goal", () => {
        const { rerender } = render(<WaterTracker entries={[drink("a", 2000)]} targetMl={2000} isCustomGoal onAdd={() => {}} onUndo={() => {}} />)
        expect(screen.getByText("Goal reached")).toBeInTheDocument()
        expect(screen.getByText("1 drink logged")).toBeInTheDocument()
        expect(screen.getByText("Goal 2 L · your custom goal")).toBeInTheDocument()

        rerender(<WaterTracker entries={[]} targetMl={0} onAdd={() => {}} onUndo={() => {}} />)
        expect(screen.getByText("0 drinks logged")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument()
    })

    it("adds the quick amounts and undoes the last drink", async () => {
        const onAdd = vi.fn()
        const onUndo = vi.fn()
        const last = drink("b", 500)
        render(<WaterTracker entries={[drink("a", 250), last]} targetMl={2000} onAdd={onAdd} onUndo={onUndo} />)

        await userEvent.click(screen.getByRole("button", { name: /Glass/ }))
        await userEvent.click(screen.getByRole("button", { name: /Bottle/ }))
        await userEvent.click(screen.getByRole("button", { name: /Large/ }))
        expect(onAdd.mock.calls).toEqual([[250], [500], [1000]])

        await userEvent.click(screen.getByRole("button", { name: "Undo 500 ml" }))
        expect(onUndo).toHaveBeenCalledWith(last)
    })

    it("adds a custom amount and ignores amounts out of range", async () => {
        const onAdd = vi.fn()
        render(<WaterTracker entries={[]} targetMl={2000} onAdd={onAdd} onUndo={() => {}} />)
        const input = screen.getByRole("spinbutton", { name: "Custom water amount in millilitres" })
        const add = screen.getByRole("button", { name: "Add" })
        expect(add).toBeDisabled()

        await userEvent.type(input, "6000")
        await userEvent.click(add)
        await userEvent.clear(input)
        await userEvent.type(input, "0")
        await userEvent.click(add)
        expect(onAdd).not.toHaveBeenCalled()

        await userEvent.clear(input)
        await userEvent.type(input, "330{Enter}")
        expect(onAdd).toHaveBeenCalledWith(330)
        expect(input).toHaveValue(null)
    })

    it("drops a falling drop and raises the water once it lands", async () => {
        reducedMotion(false)
        vi.useFakeTimers()
        try {
            const onAdd = vi.fn()
            const { container, rerender } = render(<WaterTracker entries={[]} targetMl={1000} onAdd={onAdd} onUndo={() => {}} />)
            act(() => { screen.getByRole("button", { name: /Glass/ }).click() })
            expect(onAdd).toHaveBeenCalledWith(250)
            expect(container.querySelectorAll("ellipse")).toHaveLength(1) // the splash where it lands

            rerender(<WaterTracker entries={[drink("a", 250)]} targetMl={1000} onAdd={onAdd} onUndo={() => {}} />)
            await act(async () => { await vi.advanceTimersByTimeAsync(1300) })
            expect(container.querySelectorAll("ellipse")).toHaveLength(0)
            expect(screen.getByText("25% · 750 ml to go")).toBeInTheDocument()
        } finally {
            vi.useRealTimers()
        }
    })
})
