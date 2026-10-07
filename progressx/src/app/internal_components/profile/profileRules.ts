import { LEGAL_MINIMUM_AGE } from "../legal/legalInfo"

// Rules for the profile details collected at onboarding. Shared by the form (instant feedback) and the
// API (the real check), so the two can't disagree.

export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,20}$/
export const NAME_MAX = 50
export const AGE_RANGE = [LEGAL_MINIMUM_AGE, 120] as const
export const HEIGHT_CM_RANGE = [120, 230] as const
export const WEIGHT_LB_RANGE = [70, 700] as const

export const GENDERS = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
] as const
export type Gender = typeof GENDERS[number]["value"]

// activity_level 1..5 (also drives the calorie and water targets)
export const ACTIVITY_LEVELS = [
    { value: 1, label: "Sedentary", detail: "Little to no exercise" },
    { value: 2, label: "Lightly active", detail: "Light exercise 1-3 days a week" },
    { value: 3, label: "Moderately active", detail: "Moderate exercise 3-5 days a week" },
    { value: 4, label: "Very active", detail: "Hard exercise 6-7 days a week" },
    { value: 5, label: "Extra active", detail: "Very hard exercise or a physical job" },
] as const

export const CM_PER_INCH = 2.54
export const LB_PER_KG = 2.20462262

export type OnboardingDetails = {
    username: string,
    name: string,
    age: number,
    gender: Gender,
    heightCm: number,
    weightLbs: number,
    activity: number,
}

export type FieldErrors = Partial<Record<keyof OnboardingDetails, string>>

export function usernameError(username: string): string | null {
    if (!username) return "Pick a username"
    if (username.length < 3 || username.length > 20) return "Usernames are 3 to 20 characters"
    if (!USERNAME_PATTERN.test(username)) return "Use letters, numbers, underscores or periods"
    if (/^[_.]|[_.]$/.test(username)) return "Can't start or end with _ or ."
    if (/[_.]{2}/.test(username)) return "No two _ or . in a row"
    return null
}

const inRange = (value: number, [min, max]: readonly [number, number]) => Number.isFinite(value) && value >= min && value <= max

// Checks every field; returns the problems by field (empty when everything is fine)
export function validateOnboarding(details: Partial<OnboardingDetails>): FieldErrors {
    const errors: FieldErrors = {}
    const username = usernameError(String(details.username ?? "").trim())
    if (username) errors.username = username

    const name = String(details.name ?? "").trim()
    if (!name) errors.name = "Add your name"
    else if (name.length > NAME_MAX) errors.name = `Keep it under ${NAME_MAX} characters`

    const age = Number(details.age)
    if (!Number.isInteger(age) || !inRange(age, AGE_RANGE)) errors.age = `You must be ${AGE_RANGE[0]} or older to use ProgressX`

    if (!GENDERS.some((g) => g.value === details.gender)) errors.gender = "Choose one"

    if (!inRange(Number(details.heightCm), HEIGHT_CM_RANGE)) errors.heightCm = "That height doesn't look right"
    if (!inRange(Number(details.weightLbs), WEIGHT_LB_RANGE)) errors.weightLbs = "That weight doesn't look right"

    if (!ACTIVITY_LEVELS.some((level) => level.value === Number(details.activity))) errors.activity = "Choose how active you are"
    return errors
}
