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

describe("SearchFacets", () => {
    it("lists each year and journal with its count", () => {
        render(<SearchFacets facets={facets} filters={noFilters()} onToggle={() => {}} onClear={() => {}} />)
        expect(screen.getByRole("group", { name: "Year" })).toBeInTheDocument()
        expect(screen.getByRole("checkbox", { name: "2021, 4 studies" })).not.toBeChecked()
        expect(screen.getByRole("checkbox", { name: "Sports Medicine, 3 studies" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument()
    })

    it("toggles a value and clears every filter", async () => {
        const onToggle = vi.fn()
        const onClear = vi.fn()
        render(<SearchFacets facets={facets} filters={{ year: ["2022"], journal: [] }} onToggle={onToggle} onClear={onClear} />)
        expect(screen.getByRole("checkbox", { name: "2022, 1 study" })).toBeChecked()

        await userEvent.click(screen.getByRole("checkbox", { name: "2021, 4 studies" }))
        expect(onToggle).toHaveBeenCalledWith("year", "2021")
        await userEvent.click(screen.getByRole("checkbox", { name: "Sports Medicine, 3 studies" }))
        expect(onToggle).toHaveBeenCalledWith("journal", "Sports Medicine")

        await userEvent.click(screen.getByRole("button", { name: "Clear filters" }))
        expect(onClear).toHaveBeenCalled()
    })

    it("renders nothing when there's nothing to filter by", () => {
        const { container } = render(<SearchFacets facets={undefined} filters={noFilters()} onToggle={() => {}} onClear={() => {}} />)
        expect(container).toBeEmptyDOMElement()
    })
})
