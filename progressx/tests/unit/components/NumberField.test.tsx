// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import NumberField from "@/app/internal_components/mydiet/NumberField"
import { formatVolume } from "@/app/internal_components/mydiet/WaterTracker"

function Controlled({ initial = 0, onValue = () => {}, min }: { initial?: number, onValue?: (value: number) => void, min?: number }) {
    const [value, setValue] = useState(initial)
    return <NumberField id="n" aria-label="Amount" value={value} min={min} step={0.5} onChange={(n) => { setValue(n); onValue(n) }} />
}

describe("NumberField", () => {
    it("replaces the value when typing instead of making 05", async () => {
        const onValue = vi.fn()
        render(<Controlled onValue={onValue} />)
        const input = screen.getByRole("spinbutton", { name: "Amount" })
        await userEvent.click(input) // focusing selects the 0
        await userEvent.keyboard("5")
        expect(input).toHaveValue(5)
        expect(onValue).toHaveBeenLastCalledWith(5)
    })

    it("can be emptied while typing and shows 0 again on blur", async () => {
        render(<Controlled initial={3} />)
        const input = screen.getByRole("spinbutton", { name: "Amount" })
        await userEvent.clear(input)
        expect(input).toHaveValue(null)
        await userEvent.tab()
        expect(input).toHaveValue(0)
    })

    it("steps with the arrow buttons and never goes below the minimum", async () => {
        const onValue = vi.fn()
        render(<Controlled initial={0.5} min={0} onValue={onValue} />)
        await userEvent.click(screen.getByRole("button", { name: "Increase value" }))
        expect(onValue).toHaveBeenLastCalledWith(1)
        await userEvent.click(screen.getByRole("button", { name: "Decrease value" }))
        await userEvent.click(screen.getByRole("button", { name: "Decrease value" }))
        await userEvent.click(screen.getByRole("button", { name: "Decrease value" }))
        expect(onValue).toHaveBeenLastCalledWith(0)
    })
})

describe("formatVolume", () => {
    it.each([[250, "250 ml"], [1000, "1 L"], [1500, "1.5 L"], [2250, "2.25 L"]])("%d ml -> %s", (ml, text) => {
        expect(formatVolume(ml)).toBe(text)
    })
})
