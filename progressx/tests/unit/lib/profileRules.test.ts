import { describe, expect, it } from "vitest"
import { usernameError, validateOnboarding, type OnboardingDetails } from "@/app/internal_components/profile/profileRules"

const valid: OnboardingDetails = { username: "lift_daily", name: "Sam", age: 30, gender: "other", heightCm: 175, weightLbs: 180, activity: 3 }

describe("usernameError", () => {
    it.each(["abc", "lift.daily", "A_1", "x".repeat(20)])("accepts %s", (name) => {
        expect(usernameError(name)).toBeNull()
    })
    it.each([
        ["", "Pick a username"],
        ["ab", "Usernames are 3 to 20 characters"],
        ["x".repeat(21), "Usernames are 3 to 20 characters"],
        ["bad name", "Use letters, numbers, underscores or periods"],
        ["émile", "Use letters, numbers, underscores or periods"],
        ["_abc", "Can't start or end with _ or ."],
        ["abc.", "Can't start or end with _ or ."],
        ["a__b", "No two _ or . in a row"],
        ["a._b", "No two _ or . in a row"],
    ])("rejects %j", (name, message) => {
        expect(usernameError(name)).toBe(message)
    })
})

describe("validateOnboarding", () => {
    it("has no errors for a complete, valid profile", () => {
        expect(validateOnboarding(valid)).toEqual({})
    })

    it("reports every bad field at once", () => {
        const errors = validateOnboarding({})
        expect(Object.keys(errors).sort()).toEqual(["activity", "age", "gender", "heightCm", "name", "username", "weightLbs"])
    })

    it("enforces the legal minimum age of 18", () => {
        expect(validateOnboarding({ ...valid, age: 17 }).age).toMatch(/18 or older/)
        expect(validateOnboarding({ ...valid, age: 18 }).age).toBeUndefined()
        expect(validateOnboarding({ ...valid, age: 30.5 }).age).toBeDefined()
    })

    it("checks body measurements are plausible", () => {
        expect(validateOnboarding({ ...valid, heightCm: 119 }).heightCm).toBeDefined()
        expect(validateOnboarding({ ...valid, weightLbs: 701 }).weightLbs).toBeDefined()
    })

    it("limits names to 50 characters", () => {
        expect(validateOnboarding({ ...valid, name: "n".repeat(51) }).name).toBe("Keep it under 50 characters")
    })
})
