"use client";

import { useMemo, useState } from "react";
import styles from "./workouts.module.css";
import { EXERCISES, Exercise, MUSCLE_GROUPS, MUSCLE_LABELS, MuscleGroup, exerciseInGroup } from "./exercises";

const GROUPS = Object.keys(MUSCLE_GROUPS) as MuscleGroup[]

// Search + muscle group filter over the exercise library
export function useExerciseFilter() {
    const [ query, setQuery ] = useState("")
    const [ group, setGroup ] = useState<MuscleGroup | null>(null)

    const results = useMemo(() => {
        const q = query.trim().toLowerCase()
        const matches = EXERCISES.filter((exercise) => {
            if (group && !exerciseInGroup(exercise, group)) return false
            if (!q) return true
            const haystack = [exercise.name, exercise.equipment, ...exercise.primary.map((m) => MUSCLE_LABELS[m]), ...exercise.secondary.map((m) => MUSCLE_LABELS[m])].join(" ").toLowerCase()
            return haystack.includes(q)
        })
        // with a group picked, exercises that mainly train it (first primary muscle) come first
        if (!group) return matches
        const leads = (exercise: Exercise) => MUSCLE_GROUPS[group].includes(exercise.primary[0])
        return [...matches.filter(leads), ...matches.filter((exercise) => !leads(exercise))]
    }, [query, group])

    return { query, setQuery, group, setGroup, results }
}

type FilterBarProps = {
    query: string,
    onQuery: (value: string) => void,
    group: MuscleGroup | null,
    onGroup: (value: MuscleGroup | null) => void,
    autoFocus?: boolean,
}

export function ExerciseFilterBar({ query, onQuery, group, onGroup, autoFocus }: FilterBarProps) {
    return (
        <div className={styles.filterBar}>
            <input
                type="search"
                className={`${styles.input} ${styles.search}`}
                placeholder="Search exercises or muscles"
                aria-label="Search exercises"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                autoFocus={autoFocus}
            />
            <div className={styles.chips} role="group" aria-label="Filter by muscle group">
                <button type="button" className={styles.chip} aria-pressed={group === null} onClick={() => onGroup(null)}>All</button>
                {GROUPS.map((g) => (
                    <button key={g} type="button" className={styles.chip} aria-pressed={group === g} onClick={() => onGroup(group === g ? null : g)}>{g}</button>
                ))}
            </div>
        </div>
    )
}

export function muscleSummary(exercise: Exercise) {
    return exercise.primary.map((m) => MUSCLE_LABELS[m]).join(" · ")
}
