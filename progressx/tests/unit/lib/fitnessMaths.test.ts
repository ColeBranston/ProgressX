import dayjs from "dayjs"
import { describe, expect, it } from "vitest"
import { getCalorieTarget, getMacroTargets, getScoreCategories, getTotalExpenditure, weightKgFromProfile } from "@/app/internal_components/mydiet/dietTargets"
import { averageCompletion, calorieGoalCompletion, getDailyScore } from "@/app/internal_components/mydiet/DailyScore"
import { getWaterTargetMl } from "@/app/internal_components/mydiet/waterTarget"
import { ALL_MICRONUTRIENT_NAMES, getMicronutrientTargets } from "@/app/internal_components/mydiet/microNutrients"
import { estimatedOneRepMax, EXERCISES, formatWeight, fromKg, isExerciseId, toKg } from "@/app/internal_components/mystats/exercises"
import {
    bestE1rmBefore, exerciseWeeks, lastSession, muscleGroupWeeklySets, overloadSuggestion, parseRepRange, personalRecords, recentWeeks,
    suggestedSplitDay, weeklySessions, type WorkoutSet, type WorkoutSplit,
} from "@/app/internal_components/mystats/workoutStats"
import { formatWeight as formatBodyWeight, fromDisplay, toDisplay } from "@/app/internal_components/weight/weightLog"

describe("energy and macro targets", () => {
    const profile = { weight: 180, height: 180, age: 30, gender: "male", activity: 3 }

    it("uses Mifflin-St Jeor times the activity multiplier", () => {
        const kg = 180 * 0.45359237
        expect(weightKgFromProfile(profile)).toBeCloseTo(kg)
        expect(getTotalExpenditure(profile)).toBe(Math.round(1.55 * (10 * kg + 6.25 * 180 - 150 + 5)))
        expect(getTotalExpenditure({ ...profile, gender: "female" })).toBe(Math.round(1.55 * (10 * kg + 6.25 * 180 - 150 - 161)))
    })
    it("returns 0 for incomplete profiles", () => {
        expect(getTotalExpenditure({ ...profile, activity: 9 })).toBe(0)
        expect(getTotalExpenditure({})).toBe(0)
    })
    it("adjusts calories for the goal", () => {
        expect(getCalorieTarget(2500, "Deficit")).toBe(2000)
        expect(getCalorieTarget(2500, "Maintain")).toBe(2500)
        expect(getCalorieTarget(2500, "Surplus")).toBe(2750)
        expect(getCalorieTarget(0, "Surplus")).toBe(0)
    })
    it("makes macros that add up to the calorie target", () => {
        const macros = getMacroTargets(80, 2500)
        expect(macros.protein).toBe(192)
        expect(macros.protein * 4 + macros.carbs * 4 + macros.fats * 9).toBeCloseTo(2500, -1)
    })
    it("never lets fat fall below its floor or carbs go negative", () => {
        const macros = getMacroTargets(150, 1200)
        expect(macros.fats).toBe(90)
        expect(macros.carbs).toBe(0)
        expect(getMacroTargets(70, 0).protein).toBe(168) // falls back to 2100 kcal
    })
})

describe("daily score", () => {
    it("caps each target at 100% and only lets limits take credit away", () => {
        expect(averageCompletion([{ consumed: 200, target: 100 }, { consumed: 50, target: 100 }])).toBe(0.75)
        expect(averageCompletion([{ consumed: 100, target: 100 }, { consumed: 3450, target: 2300, kind: "limit" }])).toBeCloseTo(0.5)
        expect(averageCompletion([{ consumed: 100, target: 2300, kind: "limit" }])).toBe(1)
        expect(averageCompletion([{ consumed: 5, target: 0 }])).toBeNull()
    })
    it("gives full marks inside the goal's calorie range", () => {
        expect(calorieGoalCompletion(2000, 2500, "Deficit")).toBe(1)
        expect(calorieGoalCompletion(2510, 2500, "Maintain")).toBe(1)
        expect(calorieGoalCompletion(750, 2500, "Deficit")).toBeCloseTo(0.5)
        expect(calorieGoalCompletion(6000, 2500, "Surplus")).toBe(0)
        expect(calorieGoalCompletion(2000, 0, "Maintain")).toBeNull()
    })
    it("weights the categories that are tracked", () => {
        expect(getDailyScore([{ label: "a", weight: 0.5, fraction: 1 }, { label: "b", weight: 0.5, fraction: 0 }, { label: "c", weight: 1, fraction: null }])).toBe(0.5)
        expect(getDailyScore([])).toBe(0)
    })
    it("scores a perfect day at 100%", () => {
        const micros = getMicronutrientTargets("male", 30, ["Iron", "Sodium"])
        const categories = getScoreCategories(
            { calories: 2500, protein: 180, carbs: 250, fats: 80, waterMl: 3000, micronutrients: { Iron: 8, Sodium: 1500 } },
            { totalExpenditure: 2500, goal: "Maintain", macros: { protein: 180, carbs: 250, fats: 80 }, waterMl: 3000, micros },
        )
        expect(getDailyScore(categories)).toBe(1)
    })
})

describe("water and micronutrient targets", () => {
    it("scales water with weight and activity, rounded to 50 ml and clamped", () => {
        expect(getWaterTargetMl({ weightLbs: 180, activity: 3 })).toBe(Math.round((180 * 0.45359237 * 35 + 500) / 50) * 50)
        expect(getWaterTargetMl({ weightLbs: 60, activity: 1 })).toBe(1500)
        expect(getWaterTargetMl({ weightLbs: 700, activity: 5 })).toBe(5000)
        expect(getWaterTargetMl({ gender: "female" })).toBe(2200)
        expect(getWaterTargetMl({})).toBe(2500)
    })
    it("has a target for every micronutrient and filters to the ones shown", () => {
        const all = getMicronutrientTargets("female", 25)
        expect(all.map((m) => m.name)).toEqual(ALL_MICRONUTRIENT_NAMES)
        expect(all.find((m) => m.name === "Iron")?.total).toBe(18)
        expect(all.find((m) => m.name === "Sodium")?.kind).toBe("limit")
        expect(getMicronutrientTargets("other", 25, ["Iron"]).map((m) => m.name)).toEqual(["Iron"])
    })
})

describe("weights and one-rep max", () => {
    it("converts between kg and lb", () => {
        expect(toKg(220.462262, "lb")).toBeCloseTo(100)
        expect(fromKg(100, "lb")).toBe(220.5)
        expect(formatWeight(100, "kg")).toBe("100 kg")
        expect(toDisplay(100, "lb")).toBeCloseTo(220.46)
        expect(fromDisplay(100, "kg")).toBe(100)
        expect(formatBodyWeight(80, "kg", false)).not.toContain("kg")
    })
    it("uses the Epley formula", () => {
        expect(estimatedOneRepMax(100, 1)).toBe(100)
        expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.33)
        expect(estimatedOneRepMax(0, 5)).toBe(0)
    })
    it("has unique exercise ids", () => {
        expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length)
        expect(isExerciseId("barbell-bench-press")).toBe(true)
        for (const inherited of ["__proto__", "constructor", "toString", "hasOwnProperty"]) expect(isExerciseId(inherited)).toBe(false)
    })
})

const set = (performed_on: string, weight_kg: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
    id: `${performed_on}-${weight_kg}-${reps}-${Math.random()}`, exercise_id: "barbell-bench-press", performed_on, weight_kg, reps,
    split_id: null, split_day_index: null, created_at: `${performed_on}T12:00:00Z`, ...extra,
})

describe("workout statistics", () => {
    const sets = [set("2026-10-01", 100, 5), set("2026-10-01", 100, 6), set("2026-10-05", 105, 3), set("2026-10-05", 80, 12)]

    it("finds personal records", () => {
        const pr = personalRecords(sets, "barbell-bench-press")
        expect(pr.heaviest?.weight_kg).toBe(105)
        expect(pr.mostReps?.reps).toBe(12)
        expect(pr.bestE1rm?.e1rmKg).toBeCloseTo(120)
        expect(pr.bestSession).toEqual({ date: "2026-10-05", volumeKg: 105 * 3 + 80 * 12 })
        expect(personalRecords(sets, "squat").heaviest).toBeNull()
    })
    it("finds the previous session and best e1RM before a date", () => {
        expect(lastSession(sets, "barbell-bench-press", "2026-10-05")?.sets).toHaveLength(2)
        expect(lastSession(sets, "barbell-bench-press", "2026-10-01")).toBeNull()
        expect(bestE1rmBefore(sets, "barbell-bench-press", "2026-10-05")).toBeCloseTo(120)
    })
    it("summarises weeks", () => {
        const weeks = recentWeeks(2, dayjs("2026-10-07"))
        expect(weeks.map((w) => w.format("YYYY-MM-DD"))).toEqual(["2026-09-27", "2026-10-04"])
        const [first, second] = exerciseWeeks(sets, "barbell-bench-press", weeks)
        expect(first).toMatchObject({ sets: 2, sessions: 1, topWeightKg: 100, volumeKg: 1100 })
        expect(second).toMatchObject({ sets: 2, topWeightKg: 105, bestReps: 12 })
        expect(weeklySessions(sets, weeks).map((w) => w.sessions)).toEqual([1, 1])
        expect(muscleGroupWeeklySets(sets, weeks).Chest["2026-10-04"].sets).toBe(2)
    })
    it("suggests double progression", () => {
        expect(parseRepRange("8-12")).toEqual([8, 12])
        expect(parseRepRange("5")).toEqual([5, 5])
        expect(parseRepRange("12-8")).toBeNull()
        expect(overloadSuggestion([set("d", 100, 12), set("d", 100, 12)], "8-12", "kg")).toBe("You hit 12+ reps on every set last time. Try 102.5 kg today.")
        expect(overloadSuggestion([set("d", 100, 9), set("d", 100, 12)], "8-12", "kg")).toBe("Add a rep: aim for 100 kg × 10, 12 today.")
        expect(overloadSuggestion([set("d", 0, 15)], "8-12", "kg", true)).toMatch(/Add weight or slow/)
        expect(overloadSuggestion([], "8-12", "kg")).toBeNull()
    })
    it("rotates through the split's days", () => {
        const split = { id: "s", days: [{ name: "A", exercises: [] }, { name: "B", exercises: [] }, { name: "C", exercises: [] }] } as unknown as WorkoutSplit
        expect(suggestedSplitDay(split, [], "2026-10-09")).toBe(0)
        expect(suggestedSplitDay(split, [set("2026-10-08", 1, 1, { split_id: "s", split_day_index: 2 })], "2026-10-09")).toBe(0)
        expect(suggestedSplitDay(split, [set("2026-10-07", 1, 1, { split_id: "s", split_day_index: 0 })], "2026-10-09")).toBe(1)
        expect(suggestedSplitDay(split, [set("2026-10-09", 1, 1, { split_id: "s", split_day_index: 1 })], "2026-10-09")).toBe(1)
    })
})
