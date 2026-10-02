"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import styles from "./workouts.module.css";
import ExerciseAnimation from "./ExerciseAnimation";
import ExercisePicker from "./ExercisePicker";
import { muscleSummary } from "./ExerciseFilters";
import { EXERCISE_BY_ID, SplitDayExercise, WeightUnit, estimatedOneRepMax, formatWeight, fromKg, toKg } from "./exercises";
import { WorkoutSet, WorkoutSplit, bestE1rmBefore, lastSession, overloadSuggestion, suggestedSplitDay } from "./workoutStats";

export type NewSet = { exerciseId: string, weightKg: number, reps: number, splitId: string | null, splitDayIndex: number | null }

type WorkoutLogProps = {
    date: string, // YYYY-MM-DD
    onDateChange: (date: string) => void,
    choice: string | undefined,         // workout picked for this date ("splitId:dayIndex" or freestyle); undefined = suggest one
    onChoiceChange: (choice: string) => void,
    splits: WorkoutSplit[],
    sets: WorkoutSet[],
    unit: WeightUnit,
    extraExercises: string[],          // exercises added to this date outside the split day
    onAddExtra: (exerciseId: string) => void,
    onAddSet: (set: NewSet) => Promise<boolean>,
    onDeleteSet: (set: WorkoutSet) => Promise<void>,
    onDeleteSets: (sets: WorkoutSet[]) => Promise<boolean>,
    onOpenExercise: (exerciseId: string) => void,
    onGoToSplits: () => void,
}

const FREESTYLE = "freestyle"

export default function WorkoutLog(props: WorkoutLogProps) {
    const { date, onDateChange, choice: pickedChoice, onChoiceChange, splits, sets, unit, extraExercises, onAddExtra, onAddSet, onDeleteSet, onDeleteSets, onOpenExercise, onGoToSplits } = props
    const today = dayjs().format("YYYY-MM-DD")
    const active = splits.find((split) => split.is_active) ?? null

    // "splitId:dayIndex" or freestyle: what was picked for this date, else the active split's suggested day
    const choice = pickedChoice ?? (active ? `${active.id}:${suggestedSplitDay(active, sets, date)}` : FREESTYLE)
    const [ picking, setPicking ] = useState(false)
    const [ pendingChoice, setPendingChoice ] = useState<string | null>(null) // switch waiting on "replace or keep"
    const [ replacing, setReplacing ] = useState(false)

    useEffect(() => { setPendingChoice(null) }, [date])

    const [ chosenSplit, chosenDay ] = useMemo(() => {
        if (choice === FREESTYLE) return [null, null] as const
        const [splitId, index] = choice.split(":")
        const split = splits.find((s) => s.id === splitId)
        const dayIndex = Number(index)
        return split && split.days[dayIndex] ? [split, dayIndex] as const : [null, null] as const
    }, [choice, splits])

    const planned: SplitDayExercise[] = chosenSplit && chosenDay !== null ? chosenSplit.days[chosenDay].exercises : []
    const daySets = sets.filter((s) => s.performed_on === date)

    // Sets already logged on this date for a different split day than `value`
    const setsFromOtherDay = (value: string) => daySets.filter((s) => s.split_id !== null && `${s.split_id}:${s.split_day_index}` !== value)
    const dayName = (set: WorkoutSet) => splits.find((split) => split.id === set.split_id)?.days[set.split_day_index ?? -1]?.name ?? "another workout"
    const choiceName = (value: string) => {
        if (value === FREESTYLE) return "Freestyle"
        const [splitId, index] = value.split(":")
        return splits.find((split) => split.id === splitId)?.days[Number(index)]?.name ?? "this workout"
    }

    function changeChoice(value: string) {
        if (value === choice) return
        if (setsFromOtherDay(value).length > 0) return setPendingChoice(value)
        setPendingChoice(null)
        onChoiceChange(value)
    }

    async function confirmSwitch(replace: boolean) {
        if (!pendingChoice) return
        if (replace) {
            setReplacing(true)
            const ok = await onDeleteSets(setsFromOtherDay(pendingChoice))
            setReplacing(false)
            if (!ok) return
        }
        onChoiceChange(pendingChoice)
        setPendingChoice(null)
    }

    const conflicting = pendingChoice ? setsFromOtherDay(pendingChoice) : []
    const conflictingNames = Array.from(new Set(conflicting.map(dayName)))
    const plannedIds = new Set(planned.map((p) => p.exerciseId))
    const others = Array.from(new Set([...daySets.map((s) => s.exercise_id), ...extraExercises])).filter((id) => !plannedIds.has(id) && EXERCISE_BY_ID[id])

    const rows: { exerciseId: string, plan?: SplitDayExercise }[] = [
        ...planned.filter((p) => EXERCISE_BY_ID[p.exerciseId]).map((plan) => ({ exerciseId: plan.exerciseId, plan })),
        ...others.map((exerciseId) => ({ exerciseId })),
    ]

    const shift = (days: number) => {
        const next = dayjs(date).add(days, "day")
        if (!next.isAfter(dayjs(), "day")) onDateChange(next.format("YYYY-MM-DD"))
    }

    const doneSets = daySets.length
    const plannedSets = planned.reduce((sum, p) => sum + p.sets, 0)

    return (
        <>
            <div className={styles.logToolbar}>
                <div className={styles.dateNav}>
                    <button type="button" className={styles.iconButton} onClick={() => shift(-1)} aria-label="Previous day">‹</button>
                    <span className={styles.dateLabel} aria-live="polite">{date === today ? "Today" : dayjs(date).format("ddd, MMM D")}</span>
                    <button type="button" className={styles.iconButton} onClick={() => shift(1)} disabled={date >= today} aria-label="Next day">›</button>
                </div>
                {date !== today ? <button type="button" className={styles.ghostButton} onClick={() => onDateChange(today)}>Jump to today</button> : null}

                <label className={styles.dateNav}>
                    <span className={styles.muted}>Workout</span>
                    <select className={styles.select} value={pendingChoice ?? choice} onChange={(e) => changeChoice(e.target.value)} disabled={replacing}>
                        {splits.map((split) => (
                            <optgroup key={split.id} label={split.is_active ? `${split.name} (active)` : split.name}>
                                {split.days.map((day, i) => <option key={i} value={`${split.id}:${i}`}>{day.name}</option>)}
                            </optgroup>
                        ))}
                        <option value={FREESTYLE}>Freestyle (no split)</option>
                    </select>
                </label>

                {plannedSets > 0 ? <span className={styles.muted}>{doneSets} of {plannedSets} planned sets logged</span> : null}
            </div>

            {pendingChoice && conflicting.length > 0 ?
                <div className={styles.switchConfirm} role="alertdialog" aria-labelledby="switch-title" aria-describedby="switch-text">
                    <p id="switch-title" className={styles.switchTitle}>Switch this day to {choiceName(pendingChoice)}?</p>
                    <p id="switch-text" className={styles.muted}>
                        You already logged {conflicting.length} {conflicting.length === 1 ? "set" : "sets"} for {conflictingNames.join(" and ")} on this day.
                        Replace them if they were logged by mistake, or keep them if you did both.
                        Kept sets still count in your progress.
                    </p>
                    <div className={styles.buttonRow}>
                        <button type="button" className={styles.dangerButton} disabled={replacing} onClick={() => confirmSwitch(true)}>
                            {replacing ? "Removing…" : `Replace (remove ${conflicting.length} ${conflicting.length === 1 ? "set" : "sets"})`}
                        </button>
                        <button type="button" className={styles.ghostButton} disabled={replacing} onClick={() => confirmSwitch(false)}>Keep them too</button>
                        <button type="button" className={styles.ghostButton} disabled={replacing} onClick={() => setPendingChoice(null)}>Cancel</button>
                    </div>
                </div>
            : null}

            {splits.length === 0 ?
                <div className={styles.hint}>
                    Set up a workout split to get each day&apos;s exercises planned for you.{" "}
                    <button type="button" className={styles.ghostButton} style={{ height: 30, marginLeft: 6 }} onClick={onGoToSplits}>Create a split</button>
                </div>
            : null}

            <div className={styles.logList}>
                {rows.length === 0 ?
                    <p className={styles.muted}>Nothing planned for this day. Add an exercise to start logging.</p>
                : null}
                {rows.map(({ exerciseId, plan }) => (
                    <ExerciseLogCard
                        key={exerciseId}
                        exerciseId={exerciseId}
                        plan={plan}
                        date={date}
                        sets={sets}
                        unit={unit}
                        onOpen={() => onOpenExercise(exerciseId)}
                        onAdd={(weightKg, reps) => onAddSet({
                            exerciseId,
                            weightKg,
                            reps,
                            splitId: plan && chosenSplit ? chosenSplit.id : null,
                            splitDayIndex: plan && chosenDay !== null ? chosenDay : null,
                        })}
                        onDelete={onDeleteSet}
                    />
                ))}
            </div>

            <div className={styles.buttonRow}>
                <button type="button" className={styles.ghostButton} onClick={() => setPicking(true)}>+ Add exercise</button>
            </div>

            {picking ?
                <ExercisePicker
                    exclude={rows.map((row) => row.exerciseId)}
                    onClose={() => setPicking(false)}
                    onPick={(exerciseId) => {
                        onAddExtra(exerciseId)
                        setPicking(false)
                    }}
                />
            : null}
        </>
    )
}

// ---------- One exercise ----------

type ExerciseLogCardProps = {
    exerciseId: string,
    plan?: SplitDayExercise,
    date: string,
    sets: WorkoutSet[],
    unit: WeightUnit,
    onOpen: () => void,
    onAdd: (weightKg: number, reps: number) => Promise<boolean>,
    onDelete: (set: WorkoutSet) => Promise<void>,
}

function ExerciseLogCard({ exerciseId, plan, date, sets, unit, onOpen, onAdd, onDelete }: ExerciseLogCardProps) {
    const exercise = EXERCISE_BY_ID[exerciseId]
    const todaySets = sets.filter((s) => s.exercise_id === exerciseId && s.performed_on === date)
    const previous = useMemo(() => lastSession(sets, exerciseId, date), [sets, exerciseId, date])
    const priorBest = useMemo(() => bestE1rmBefore(sets, exerciseId, date), [sets, exerciseId, date])
    const todayBest = todaySets.reduce((best, s) => Math.max(best, estimatedOneRepMax(s.weight_kg, s.reps)), 0)
    const isPr = priorBest > 0 && todayBest > priorBest + 1e-6

    // prefill with the last set logged today, else the first set of the last session
    const seed = todaySets[todaySets.length - 1] ?? previous?.sets[0]
    const [ weight, setWeight ] = useState(seed ? String(fromKg(seed.weight_kg, unit)) : "")
    const [ reps, setReps ] = useState(seed ? String(seed.reps) : "")
    const [ saving, setSaving ] = useState(false)
    const [ error, setError ] = useState<string | null>(null)
    const [ deleting, setDeleting ] = useState<string | null>(null)

    useEffect(() => {
        setWeight(seed ? String(fromKg(seed.weight_kg, unit)) : "")
        setReps(seed ? String(seed.reps) : "")
        // re-seed when the day or unit changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, unit])

    async function submit(e: FormEvent) {
        e.preventDefault()
        const w = weight.trim() === "" ? 0 : Number(weight)
        const r = Number(reps)
        const maxWeight = unit === "kg" ? 1000 : 2204
        if (!Number.isFinite(w) || w < 0 || w > maxWeight) return setError(`Weight must be 0 to ${maxWeight} ${unit}.`)
        if (!Number.isInteger(r) || r < 1 || r > 600) return setError("Reps must be a whole number from 1 to 600.")
        setError(null)
        setSaving(true)
        const ok = await onAdd(toKg(w, unit), r)
        setSaving(false)
        if (!ok) setError("Couldn't save that set. Try again.")
    }

    if (!exercise) return null
    const suggestion = todaySets.length === 0 ? overloadSuggestion(previous?.sets, plan?.reps, unit, exercise.bodyweight) : null
    const showSet = (s: WorkoutSet) => s.weight_kg > 0 ? `${formatWeight(s.weight_kg, unit)} × ${s.reps}` : `${exercise.bodyweight ? "Bodyweight" : formatWeight(0, unit)} × ${s.reps}`

    return (
        <article className={styles.logCard} aria-label={exercise.name}>
            <button type="button" className={`${styles.thumbButton} ${styles.stage}`} onClick={onOpen} aria-label={`About ${exercise.name}`}>
                <ExerciseAnimation motion={exercise.motion} label="" />
            </button>
            <div className={styles.logMain}>
                <div className={styles.logTitleRow}>
                    <div>
                        <h3 className={styles.logTitle}>
                            {exercise.name}
                            {isPr ? <span className={styles.prBadge}>PR</span> : null}
                        </h3>
                        <p className={styles.muted}>{muscleSummary(exercise)}</p>
                    </div>
                    {plan ? <span className={styles.target}>{todaySets.length}/{plan.sets} sets · {plan.reps} reps</span> : null}
                </div>

                {previous ?
                    <p className={styles.muted}>
                        Last time ({dayjs(previous.date).format("MMM D")}): {previous.sets.map(showSet).join(", ")}
                    </p>
                : null}
                {suggestion ? <p className={styles.hint}>{suggestion}</p> : null}

                {todaySets.length ?
                    <ol className={styles.setTable}>
                        {todaySets.map((s, i) => (
                            <li key={s.id} className={styles.setRow}>
                                <span className={styles.setIndex}>{i + 1}</span>
                                <span>{showSet(s)}</span>
                                <span className={styles.setE1rm}>{s.weight_kg > 0 ? `e1RM ${formatWeight(estimatedOneRepMax(s.weight_kg, s.reps), unit)}` : ""}</span>
                                <button
                                    type="button"
                                    className={styles.iconButton}
                                    disabled={deleting === s.id}
                                    aria-label={`Delete set ${i + 1}`}
                                    onClick={async () => {
                                        setDeleting(s.id)
                                        await onDelete(s)
                                        setDeleting(null)
                                    }}
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ol>
                : null}

                <form className={styles.addSetRow} onSubmit={submit}>
                    <label className={styles.fieldWrap}>
                        <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" aria-label={`Weight in ${unit}`} onFocus={(e) => e.target.select()} />
                        <span>{exercise.bodyweight ? `+${unit}` : unit}</span>
                    </label>
                    <span className={styles.muted}>×</span>
                    <label className={styles.fieldWrap}>
                        <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="0" aria-label="Reps" onFocus={(e) => e.target.select()} />
                        <span>{exerciseId === "plank" ? "sec" : "reps"}</span>
                    </label>
                    <button type="submit" className={styles.button} disabled={saving || !reps}>{saving ? "Saving…" : "Log set"}</button>
                </form>
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </div>
        </article>
    )
}
