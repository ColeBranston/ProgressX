import dayjs, { Dayjs } from "dayjs";
import {
    EXERCISE_BY_ID,
    MUSCLE_GROUPS,
    MuscleGroup,
    SplitDay,
    WeightUnit,
    estimatedOneRepMax,
    fromKg,
} from "./exercises";

// Progressive overload math for the Workouts tab. Weeks start on Sunday (same as the diet stats).

export type WorkoutSplit = {
    id: string,
    name: string,
    days: SplitDay[],
    is_active: boolean,
    created_at: string,
    updated_at: string,
}

export type WorkoutSet = {
    id: string,
    exercise_id: string,
    performed_on: string, // YYYY-MM-DD
    weight_kg: number,
    reps: number,
    split_id: string | null,
    split_day_index: number | null,
    created_at: string,
}

export function normalizeSet(raw: WorkoutSet): WorkoutSet {
    return { ...raw, weight_kg: Number(raw.weight_kg) || 0, reps: Number(raw.reps) || 0 }
}

export function weekKey(date: string | Dayjs) {
    return dayjs(date).startOf("week").format("YYYY-MM-DD")
}

// Week starts (oldest first) covering the last `count` weeks up to and including this one
export function recentWeeks(count: number, today = dayjs()): Dayjs[] {
    const current = today.startOf("week")
    return Array.from({ length: count }, (_, i) => current.subtract(count - 1 - i, "week"))
}

export type ExerciseWeek = {
    key: string,
    label: string,
    topWeightKg: number | null,
    bestE1rmKg: number | null,
    volumeKg: number,  // sum of weight x reps
    totalReps: number,
    sets: number,
    sessions: number,
    bestReps: number | null,
}

export function exerciseWeeks(sets: WorkoutSet[], exerciseId: string, weeks: Dayjs[]): ExerciseWeek[] {
    const byWeek = new Map<string, WorkoutSet[]>()
    for (const set of sets) {
        if (set.exercise_id !== exerciseId) continue
        const key = weekKey(set.performed_on)
        byWeek.set(key, [...(byWeek.get(key) ?? []), set])
    }

    return weeks.map((start) => {
        const key = start.format("YYYY-MM-DD")
        const weekSets = byWeek.get(key) ?? []
        const has = weekSets.length > 0
        return {
            key,
            label: start.format("MMM D"),
            topWeightKg: has ? Math.max(...weekSets.map((s) => s.weight_kg)) : null,
            bestE1rmKg: has ? Math.max(...weekSets.map((s) => estimatedOneRepMax(s.weight_kg, s.reps))) : null,
            volumeKg: weekSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
            totalReps: weekSets.reduce((sum, s) => sum + s.reps, 0),
            sets: weekSets.length,
            sessions: new Set(weekSets.map((s) => s.performed_on)).size,
            bestReps: has ? Math.max(...weekSets.map((s) => s.reps)) : null,
        }
    })
}

export type PersonalRecords = {
    heaviest: WorkoutSet | null,
    bestE1rm: { set: WorkoutSet, e1rmKg: number } | null,
    mostReps: WorkoutSet | null,
    bestSession: { date: string, volumeKg: number } | null,
}

export function personalRecords(sets: WorkoutSet[], exerciseId: string): PersonalRecords {
    const mine = sets.filter((s) => s.exercise_id === exerciseId)
    if (mine.length === 0) return { heaviest: null, bestE1rm: null, mostReps: null, bestSession: null }

    const heaviest = mine.reduce((best, s) => (s.weight_kg > best.weight_kg || (s.weight_kg === best.weight_kg && s.reps > best.reps) ? s : best))
    const bestE1rm = mine.reduce<{ set: WorkoutSet, e1rmKg: number } | null>((best, s) => {
        const e1rmKg = estimatedOneRepMax(s.weight_kg, s.reps)
        return !best || e1rmKg > best.e1rmKg ? { set: s, e1rmKg } : best
    }, null)
    const mostReps = mine.reduce((best, s) => (s.reps > best.reps || (s.reps === best.reps && s.weight_kg > best.weight_kg) ? s : best))

    const sessions = new Map<string, number>()
    for (const s of mine) sessions.set(s.performed_on, (sessions.get(s.performed_on) ?? 0) + s.weight_kg * s.reps)
    const [date, volumeKg] = Array.from(sessions.entries()).reduce((best, entry) => (entry[1] > best[1] ? entry : best))

    return { heaviest, bestE1rm: bestE1rm && bestE1rm.e1rmKg > 0 ? bestE1rm : null, mostReps, bestSession: volumeKg > 0 ? { date, volumeKg } : null }
}

// The most recent day before `beforeDate` the exercise was done, with that day's sets
export function lastSession(sets: WorkoutSet[], exerciseId: string, beforeDate: string): { date: string, sets: WorkoutSet[] } | null {
    let date: string | null = null
    for (const s of sets) {
        if (s.exercise_id === exerciseId && s.performed_on < beforeDate && (!date || s.performed_on > date)) date = s.performed_on
    }
    if (!date) return null
    return { date, sets: sets.filter((s) => s.exercise_id === exerciseId && s.performed_on === date) }
}

export function bestE1rmBefore(sets: WorkoutSet[], exerciseId: string, beforeDate: string): number {
    return sets
        .filter((s) => s.exercise_id === exerciseId && s.performed_on < beforeDate)
        .reduce((best, s) => Math.max(best, estimatedOneRepMax(s.weight_kg, s.reps)), 0)
}

// "8-12" -> [8, 12], "5" -> [5, 5], anything else -> null
export function parseRepRange(reps: string): [number, number] | null {
    const match = reps.match(/^\s*(\d+)\s*(?:(?:-|–|to)\s*(\d+))?\s*$/)
    if (!match) return null
    const low = Number(match[1])
    const high = match[2] ? Number(match[2]) : low
    return low > 0 && high >= low ? [low, high] : null
}

// Double progression: once every set of the last session reached the top of the rep range at the same
// weight, it's time to add weight (+5 lb / +2.5 kg). Until then, add a rep to each set (up to the top).
export function overloadSuggestion(last: WorkoutSet[] | undefined, repRange: string | undefined, unit: WeightUnit, bodyweight = false): string | null {
    if (!last || last.length === 0) return null
    const range = repRange ? parseRepRange(repRange) : null
    const top = Math.max(...last.map((s) => s.weight_kg))
    const topSets = last.filter((s) => s.weight_kg === top)

    if (range && topSets.every((s) => s.reps >= range[1])) {
        if (bodyweight && top === 0) return `You hit ${range[1]}+ reps on every set last time. Add weight or slow the reps down.`
        const step = unit === "kg" ? 2.5 : 5
        return `You hit ${range[1]}+ reps on every set last time. Try ${fromKg(top, unit) + step} ${unit} today.`
    }

    const targets = topSets.map((s) => (range ? Math.min(range[1], s.reps + 1) : s.reps + 1))
    return top > 0
        ? `Add a rep: aim for ${fromKg(top, unit)} ${unit} × ${targets.join(", ")} today.`
        : `Add a rep: aim for ${targets.join(", ")} reps today.`
}

// Working sets per muscle group each week (an exercise counts toward its primary muscles' groups)
export function muscleGroupWeeklySets(sets: WorkoutSet[], weeks: Dayjs[]): Record<MuscleGroup, Record<string, number>> {
    const groups = Object.keys(MUSCLE_GROUPS) as MuscleGroup[]
    const result = Object.fromEntries(groups.map((group) => [group, Object.fromEntries(weeks.map((w) => [w.format("YYYY-MM-DD"), 0]))])) as Record<MuscleGroup, Record<string, number>>

    for (const set of sets) {
        const exercise = EXERCISE_BY_ID[set.exercise_id]
        if (!exercise) continue
        const key = weekKey(set.performed_on)
        const hit = new Set(groups.filter((group) => exercise.primary.some((muscle) => MUSCLE_GROUPS[group].includes(muscle))))
        for (const group of hit) {
            if (key in result[group]) result[group][key] += 1
        }
    }

    return result
}

export function weeklySessions(sets: WorkoutSet[], weeks: Dayjs[]): { key: string, label: string, sessions: number, sets: number }[] {
    return weeks.map((start) => {
        const key = start.format("YYYY-MM-DD")
        const weekSets = sets.filter((s) => weekKey(s.performed_on) === key)
        return { key, label: start.format("MMM D"), sessions: new Set(weekSets.map((s) => s.performed_on)).size, sets: weekSets.length }
    })
}

// The day of the active split to suggest for `date`: whatever was already logged that day, otherwise
// the day after the last one done (rotating), otherwise the first day.
export function suggestedSplitDay(split: WorkoutSplit, sets: WorkoutSet[], date: string): number {
    const onDate = sets.find((s) => s.split_id === split.id && s.performed_on === date && s.split_day_index !== null)
    if (onDate) return Math.min(onDate.split_day_index!, split.days.length - 1)

    const previous = sets
        .filter((s) => s.split_id === split.id && s.performed_on < date && s.split_day_index !== null)
        .sort((a, b) => (a.performed_on === b.performed_on ? a.created_at.localeCompare(b.created_at) : a.performed_on.localeCompare(b.performed_on)))
        .pop()
    return previous ? (previous.split_day_index! + 1) % split.days.length : 0
}
