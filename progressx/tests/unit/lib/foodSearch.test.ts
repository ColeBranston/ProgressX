import { describe, expect, it } from "vitest"
import { matchesFoodSearch } from "@/app/internal_components/mydiet/foodSearch"

describe("matchesFoodSearch", () => {
    it("shows everything for an empty search", () => {
        expect(matchesFoodSearch("Chicken Breast", "")).toBe(true)
        expect(matchesFoodSearch("Chicken Breast", "   ")).toBe(true)
    })

    it("needs every word, in any order and any case", () => {
        expect(matchesFoodSearch("Chicken Breast", "chick bre")).toBe(true)
        expect(matchesFoodSearch("Chicken Breast", "BREAST chicken")).toBe(true)
        expect(matchesFoodSearch("Chicken Breast", "chicken thigh")).toBe(false)
    })

    it("ignores accents either way", () => {
        expect(matchesFoodSearch("Crème fraîche", "creme")).toBe(true)
        expect(matchesFoodSearch("Jalapeno poppers", "jalapeño")).toBe(true)
    })
})
