import { isExerciseId, MAX_DAY_EXERCISES, MAX_SPLIT_DAYS, SplitDay } from "@/app/internal_components/mystats/exercises";

export const SPLIT_COLUMNS = "id, name, days, is_active, created_at, updated_at"
export const SET_COLUMNS = "id, exercise_id, performed_on, weight_kg, reps, split_id, split_day_index, created_at"

export const MAX_WEIGHT_KG = 1000 // matches the check constraint on workout_sets.weight_kg
export const MAX_REPS = 600 // matches workout_sets.reps (timed holds log seconds)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_RE.test(value)
}

export function parseSplitName(value: unknown): string | null {
    if (typeof value !== "string") return null
    const name = value.trim()
    return name.length >= 1 && name.length <= 60 ? name : null
}

// Validates a split's days from the client; returns a clean copy or an error message
export function parseSplitDays(value: unknown): { days: SplitDay[] } | { error: string } {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SPLIT_DAYS) {
        return { error: `days must have 1 to ${MAX_SPLIT_DAYS} days` }
    }

    const days: SplitDay[] = []
    for (const [i, raw] of value.entries()) {
        if (!raw || typeof raw !== "object") return { error: `day ${i + 1} is invalid` }
        const { name, exercises } = raw as { name?: unknown, exercises?: unknown }

        const dayName = typeof name === "string" ? name.trim().slice(0, 40) : ""
        if (!dayName) return { error: `day ${i + 1} needs a name` }

        if (!Array.isArray(exercises) || exercises.length > MAX_DAY_EXERCISES) {
            return { error: `${dayName} can have at most ${MAX_DAY_EXERCISES} exercises` }
        }

        const clean = []
        for (const exercise of exercises) {
            const { exerciseId, sets, reps } = (exercise ?? {}) as { exerciseId?: unknown, sets?: unknown, reps?: unknown }
            if (!isExerciseId(exerciseId)) return { error: `${dayName} has an unknown exercise` }
            const setCount = Math.round(Number(sets))
            clean.push({
                exerciseId,
                sets: Number.isFinite(setCount) ? Math.min(10, Math.max(1, setCount)) : 3,
                reps: typeof reps === "string" && reps.trim() ? reps.trim().slice(0, 12) : "8-12",
            })
        }

        days.push({ name: dayName, exercises: clean })
    }

    return { days }
}

export function parseWeightKg(value: unknown): number | null {
    const weight = Number(value)
    if (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT_KG) return null
    return Math.round(weight * 100) / 100
}

export function parseReps(value: unknown): number | null {
    const reps = Number(value)
    return Number.isInteger(reps) && reps >= 1 && reps <= MAX_REPS ? reps : null
}
