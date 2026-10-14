// @vitest-environment jsdom
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import FoodAssistant from "@/app/internal_components/mydiet/FoodAssistant"

function Assistant({ startOpen = false }: { startOpen?: boolean }) {
    const [ open, setOpen ] = useState(startOpen)
    return <FoodAssistant dateKey="2026-10-13" onAdd={async () => true} open={open} onOpenChange={setOpen} />
}

afterEach(() => vi.unstubAllGlobals())

describe("FoodAssistant expandable box", () => {
    it("starts as just its header and opens to the chat", async () => {
        render(<Assistant />)
        const toggle = screen.getByRole("button", { name: /Describe it instead/ })
        expect(toggle).toHaveAttribute("aria-expanded", "false")
        expect(toggle).toHaveTextContent("Let AI work out the numbers")
        expect(screen.queryByRole("textbox", { name: "Describe what you ate" })).not.toBeInTheDocument()

        await userEvent.click(toggle)
        expect(toggle).toHaveAttribute("aria-expanded", "true")
        expect(screen.getByRole("textbox", { name: "Describe what you ate" })).toBeVisible()
    })

    it("keeps the chat when closed and says it's still working", async () => {
        vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))) // the reply never arrives
        render(<Assistant startOpen />)

        await userEvent.type(screen.getByRole("textbox", { name: "Describe what you ate" }), "2 slices of pizza{Enter}")
        expect(screen.getByText("2 slices of pizza")).toBeVisible()

        const toggle = screen.getByRole("button", { name: /Describe it instead/ })
        await userEvent.click(toggle)
        expect(toggle).toHaveTextContent("Working on it…")
        expect(screen.queryByRole("button", { name: "New chat" })).not.toBeInTheDocument()

        await userEvent.click(toggle)
        expect(screen.getByText("2 slices of pizza")).toBeVisible()
        expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument()
    })
})
