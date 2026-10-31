// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ResultsSkeleton } from "@/app/internal_components"

describe("ResultsSkeleton", () => {
    it("tells screen readers results are loading, and hides the placeholder shapes from them", () => {
        render(<ResultsSkeleton />)
        const status = screen.getByRole("status", { name: "Loading results" })
        expect(status).toHaveAttribute("aria-busy", "true")
        expect(status).toHaveTextContent("Loading results…")
        expect(screen.getAllByTestId("study-card-skeleton")).toHaveLength(4)
        for (const card of screen.getAllByTestId("study-card-skeleton")) expect(card.closest("[aria-hidden=true]")).not.toBeNull()
    })

    it("draws as many cards as asked", () => {
        render(<ResultsSkeleton cards={2} />)
        expect(screen.getAllByTestId("study-card-skeleton")).toHaveLength(2)
    })
})
