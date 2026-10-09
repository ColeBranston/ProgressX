import { describe, expect, it } from "vitest"
import { isUuid, MAX_REPS, MAX_WEIGHT_KG, parseReps, parseSplitDays, parseSplitName, parseWeightKg } from "@/app/api/libs/workouts"
import { MAX_DAY_EXERCISES, MAX_SPLIT_DAYS } from "@/app/internal_components/mystats/exercises"

describe("isUuid", () => {
    it("accepts canonical UUIDs in either case", () => {
        expect(isUuid("4dac653a-5ef1-4dfb-ba14-f05c2738d52b")).toBe(true)
        expect(isUuid("4DAC653A-5EF1-4DFB-BA14-F05C2738D52B")).toBe(true)
    })
    it.each([undefined, null, 42, "", "not-a-uuid", "4dac653a5ef14dfbba14f05c2738d52b"])("rejects %s", (value) => {
        expect(isUuid(value)).toBe(false)
    })
})

describe("parseSplitName", () => {
    it("trims and keeps names of 1-60 characters", () => {
        expect(parseSplitName("  Push Pull Legs  ")).toBe("Push Pull Legs")
        expect(parseSplitName("x".repeat(60))).toHaveLength(60)
    })
    it("rejects empty, too long and non-string names", () => {
        expect(parseSplitName("   ")).toBeNull()
        expect(parseSplitName("x".repeat(61))).toBeNull()
        expect(parseSplitName(7)).toBeNull()
    })
})

describe("parseSplitDays", () => {
    const day = (name: unknown, exercises: unknown = [{ exerciseId: "barbell-bench-press", sets: 4, reps: "6-8" }]) => ({ name, exercises })

    it("returns a clean copy of valid days", () => {
        expect(parseSplitDays([day(" Push ")])).toEqual({ days: [{ name: "Push", exercises: [{ exerciseId: "barbell-bench-press", sets: 4, reps: "6-8" }] }] })
    })

    it("clamps sets to 1-10 and defaults missing values", () => {
        const result = parseSplitDays([day("A", [
            { exerciseId: "barbell-bench-press", sets: 99 },
            { exerciseId: "barbell-bench-press", sets: 0, reps: "  " },
            { exerciseId: "barbell-bench-press", sets: "abc" },
        ])])
        expect(result).toEqual({ days: [{ name: "A", exercises: [
            { exerciseId: "barbell-bench-press", sets: 10, reps: "8-12" },
            { exerciseId: "barbell-bench-press", sets: 1, reps: "8-12" },
            { exerciseId: "barbell-bench-press", sets: 3, reps: "8-12" },
        ] }] })
    })

    it("limits names and rep text", () => {
        const result = parseSplitDays([day("n".repeat(80), [{ exerciseId: "barbell-bench-press", sets: 3, reps: "r".repeat(30) }])])
        expect("days" in result && result.days[0].name).toHaveLength(40)
        expect("days" in result && result.days[0].exercises[0].reps).toHaveLength(12)
    })

    it.each([
        [[], `days must have 1 to ${MAX_SPLIT_DAYS} days`],
        ["nope", `days must have 1 to ${MAX_SPLIT_DAYS} days`],
        [Array.from({ length: MAX_SPLIT_DAYS + 1 }, () => day("A")), `days must have 1 to ${MAX_SPLIT_DAYS} days`],
        [[null], "day 1 is invalid"],
        [[day("  ")], "day 1 needs a name"],
        [[day("Legs", "squats")], `Legs can have at most ${MAX_DAY_EXERCISES} exercises`],
        [[day("Legs", Array.from({ length: MAX_DAY_EXERCISES + 1 }, () => ({ exerciseId: "barbell-bench-press" })))], `Legs can have at most ${MAX_DAY_EXERCISES} exercises`],
        [[day("Legs", [{ exerciseId: "made-up-lift" }])], "Legs has an unknown exercise"],
    ])("rejects %j", (input, error) => {
        expect(parseSplitDays(input)).toEqual({ error })
    })
})

describe("parseWeightKg / parseReps", () => {
    it("rounds weights to 2 decimals within 0..MAX", () => {
        expect(parseWeightKg("102.456")).toBe(102.46)
        expect(parseWeightKg(0)).toBe(0)
        expect(parseWeightKg(MAX_WEIGHT_KG)).toBe(MAX_WEIGHT_KG)
    })
    it.each([-1, MAX_WEIGHT_KG + 0.01, "heavy", Infinity, NaN])("rejects weight %s", (value) => {
        expect(parseWeightKg(value)).toBeNull()
    })
    it("accepts whole reps from 1 to MAX_REPS only", () => {
        expect(parseReps("12")).toBe(12)
        expect(parseReps(MAX_REPS)).toBe(MAX_REPS)
        for (const bad of [0, MAX_REPS + 1, 2.5, "x", null]) expect(parseReps(bad)).toBeNull()
    })
})
