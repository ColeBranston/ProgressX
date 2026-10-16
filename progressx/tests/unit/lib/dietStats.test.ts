import dayjs from "dayjs"
import { describe, expect, it } from "vitest"
import { buildDayStats, buildWeekStats, type ApiDay } from "@/app/internal_components/mystats/dietStats"

const targets = { totalExpenditure: 2000, goal: "Maintain" as const, macros: { protein: 100, carbs: 200, fats: 60 }, waterMl: 2000, micros: [] }
const day = (date: string, rest: Partial<ApiDay>): ApiDay =>
    ({ date, foods: 0, calories: 0, protein: 0, carbs: 0, fats: 0, micronutrients: {}, waterMl: 0, ...rest })

describe("diet stats weekly averages", () => {
    // Sunday 2026-10-04 to Saturday 2026-10-10: food on two days, water on two, one day with both
    const week = () => buildWeekStats(buildDayStats(dayjs("2026-10-04"), dayjs("2026-10-10"), [
        day("2026-10-05", { foods: 2, calories: 2000, protein: 100, micronutrients: { Iron: 10 } }),
        day("2026-10-06", { foods: 1, calories: 1000, protein: 50, micronutrients: { Iron: 4 }, waterMl: 1000 }),
        day("2026-10-07", { waterMl: 3000 }),
    ], targets), ["Iron"])[0]

    it("skips days with nothing logged", () => {
        expect(week()).toMatchObject({ trackedDays: 3, foodDays: 2, daysInRange: 7 })
    })

    it("averages food over days with food, and water over days with water", () => {
        expect(week()).toMatchObject({ calories: 1500, protein: 75, waterMl: 2000, micros: { Iron: 7 } })
    })

    it("doesn't let a water-only day pull down the food parts of the score, or a food-only day the water part", () => {
        const { categories } = week()
        expect(categories.Calories).toBeCloseTo(0.75, 1) // (100% + 50%) / 2, not / 3
        expect(categories.Water).toBe(0.75)              // (50% + 100%) / 2, not / 3
    })
})
