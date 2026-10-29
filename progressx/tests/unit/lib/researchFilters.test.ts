import { describe, expect, it } from "vitest"
import { facetOptions, filterQuery, hasFilters, noFilters, readFilters, toggleFilter } from "@/app/internal_components/research/researchFilters"

describe("research filters", () => {
    it("reads repeated year and journal params from the URL", () => {
        const filters = readFilters(new URLSearchParams("year=2021&year=2020&year=2021&journal=Sports%20Medicine&journal=%20"))
        expect(filters).toEqual({ year: ["2021", "2020"], journal: ["Sports Medicine"] })
    })

    it("drops years the backend would reject", () => {
        expect(readFilters(new URLSearchParams("year=21&year=2021abc&year=2019")).year).toEqual(["2019"])
    })

    it("handles no params", () => {
        expect(readFilters(null)).toEqual(noFilters())
    })

    it("toggles a value on and off without touching the other facet", () => {
        const picked = toggleFilter({ year: ["2020"], journal: ["Nutrients"] }, "year", "2021")
        expect(picked).toEqual({ year: ["2020", "2021"], journal: ["Nutrients"] })
        expect(toggleFilter(picked, "year", "2020")).toEqual({ year: ["2021"], journal: ["Nutrients"] })
    })

    it("builds the same query string whatever order values were picked in", () => {
        expect(filterQuery(noFilters())).toBe("")
        expect(filterQuery({ year: ["2021", "2019"], journal: ["J & Co"] })).toBe("?year=2019&year=2021&journal=J+%26+Co")
        expect(filterQuery({ year: ["2019", "2021"], journal: ["J & Co"] })).toBe(filterQuery({ year: ["2021", "2019"], journal: ["J & Co"] }))
    })

    it("knows when anything is picked", () => {
        expect(hasFilters(noFilters())).toBe(false)
        expect(hasFilters({ year: [], journal: ["Nutrients"] })).toBe(true)
    })

    it("keeps picked values listed when the search has none of them, so they can be unpicked", () => {
        const facets = { year: [{ value: "2021", count: 3 }], journal: [] }
        expect(facetOptions(facets, { year: ["2021", "2015"], journal: [] }, "year")).toEqual([{ value: "2021", count: 3 }, { value: "2015", count: 0 }])
        expect(facetOptions(undefined, noFilters(), "journal")).toEqual([])
    })
})
