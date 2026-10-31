// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SearchFacets } from "@/app/internal_components"
import { noFilters } from "@/app/internal_components/research/researchFilters"

const facets = {
    year: [{ value: "2022", count: 1 }, { value: "2021", count: 4 }],
    journal: [{ value: "Sports Medicine", count: 3 }],
}

const manyJournals = {
    year: [],
    journal: ["Nutrients", "Sports Medicine", "Clinical endocrinology", "Cureus", "Fertility and sterility", "Human reproduction", "Frontiers in endocrinology", "Journal of ovarian research", "Postgraduate medicine"]
        .map((value, i) => ({ value, count: 20 - i })),
}

describe("SearchFacets", () => {
    it("shows a compact button per facet, with the lists closed", () => {
        render(<SearchFacets facets={facets} filters={noFilters()} onToggle={() => {}} onClear={() => {}} />)
        expect(screen.getByRole("group", { name: "Filter results" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Year" })).toHaveAttribute("aria-expanded", "false")
        expect(screen.getByRole("button", { name: "Journal" })).toHaveAttribute("aria-expanded", "false")
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument()
    })

    it("opens one list at a time, with each value and its count", async () => {
        const user = userEvent.setup()
        render(<SearchFacets facets={facets} filters={noFilters()} onToggle={() => {}} onClear={() => {}} />)
        await user.click(screen.getByRole("button", { name: "Year" }))
        expect(screen.getByRole("dialog", { name: "Year filters" })).toBeInTheDocument()
        expect(screen.getByRole("checkbox", { name: "2021, 4 studies" })).not.toBeChecked()
        expect(screen.getByRole("checkbox", { name: "2022, 1 study" })).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Journal" }))
        expect(screen.queryByRole("dialog", { name: "Year filters" })).not.toBeInTheDocument()
        expect(screen.getByRole("checkbox", { name: "Sports Medicine, 3 studies" })).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Journal" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("toggles values, shows how many are picked, and clears every filter", async () => {
        const user = userEvent.setup()
        const onToggle = vi.fn()
        const onClear = vi.fn()
        render(<SearchFacets facets={facets} filters={{ year: ["2022"], journal: [] }} onToggle={onToggle} onClear={onClear} />)
        await user.click(screen.getByRole("button", { name: "Year, 1 selected" }))
        expect(screen.getByRole("checkbox", { name: "2022, 1 study" })).toBeChecked()
        await user.click(screen.getByRole("checkbox", { name: "2021, 4 studies" }))
        expect(onToggle).toHaveBeenCalledWith("year", "2021")
        // the list stays open so several can be picked
        expect(screen.getByRole("dialog", { name: "Year filters" })).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Journal" }))
        await user.click(screen.getByRole("checkbox", { name: "Sports Medicine, 3 studies" }))
        expect(onToggle).toHaveBeenCalledWith("journal", "Sports Medicine")

        await user.click(screen.getByRole("button", { name: "Clear filters" }))
        expect(onClear).toHaveBeenCalled()
    })

    it("closes with Escape, giving focus back to its button, or with a click outside", async () => {
        const user = userEvent.setup()
        render(<><p>Results</p><SearchFacets facets={facets} filters={noFilters()} onToggle={() => {}} onClear={() => {}} /></>)
        const year = screen.getByRole("button", { name: "Year" })
        await user.click(year)
        await user.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        expect(year).toHaveFocus()

        await user.click(year)
        await user.click(screen.getByText("Results"))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("narrows a long journal list", async () => {
        const user = userEvent.setup()
        render(<SearchFacets facets={manyJournals} filters={{ year: [], journal: ["Cureus"] }} onToggle={() => {}} onClear={() => {}} />)
        // no years for this search, so only the journal button shows
        expect(screen.queryByRole("button", { name: /^Year/ })).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Journal, 1 selected" }))
        expect(screen.getAllByRole("checkbox")).toHaveLength(9)

        // the find box has focus, so typing narrows the list straight away
        expect(screen.getByRole("searchbox", { name: "Find a journal" })).toHaveFocus()
        await user.keyboard("ENDO")
        expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual(["Clinical endocrinology, 18 studies", "Frontiers in endocrinology, 14 studies"])

        await user.clear(screen.getByRole("searchbox", { name: "Find a journal" }))
        await user.type(screen.getByRole("searchbox", { name: "Find a journal" }), "zzz")
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
        expect(screen.getByText("No journals match")).toBeInTheDocument()
    })

    it("leaves the find box out of a short journal list", async () => {
        const user = userEvent.setup()
        render(<SearchFacets facets={facets} filters={noFilters()} onToggle={() => {}} onClear={() => {}} />)
        await user.click(screen.getByRole("button", { name: "Journal" }))
        expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
    })

    it("renders nothing when there's nothing to filter by", () => {
        const { container } = render(<SearchFacets facets={undefined} filters={noFilters()} onToggle={() => {}} onClear={() => {}} />)
        expect(container).toBeEmptyDOMElement()
    })
})
