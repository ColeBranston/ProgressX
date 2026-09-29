"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import styles from "./workouts.module.css";
import Modal from "./Modal";
import ExerciseAnimation from "./ExerciseAnimation";
import MuscleMap from "./MuscleMap";
import { LineChart } from "./charts";
import { EXERCISE_BY_ID, MUSCLE_LABELS, WeightUnit, formatWeight, fromKg } from "./exercises";
import { WorkoutSet, exerciseWeeks, personalRecords, recentWeeks } from "./workoutStats";

type ExerciseDetailProps = {
    exerciseId: string,
    sets: WorkoutSet[],
    unit: WeightUnit,
    onClose: () => void,
    onLogToday?: () => void,
}

export default function ExerciseDetail({ exerciseId, sets, unit, onClose, onLogToday }: ExerciseDetailProps) {
    const exercise = EXERCISE_BY_ID[exerciseId]
    const records = useMemo(() => personalRecords(sets, exerciseId), [sets, exerciseId])
    const weeks = useMemo(() => exerciseWeeks(sets, exerciseId, recentWeeks(12)), [sets, exerciseId])
    const logged = sets.some((s) => s.exercise_id === exerciseId)

    if (!exercise) return null

    const weighted = !exercise.bodyweight || sets.some((s) => s.exercise_id === exerciseId && s.weight_kg > 0)
    const date = (value: string) => dayjs(value).format("MMM D, YYYY")

    return (
        <Modal title={exercise.name} onClose={onClose} wide>
            <div className={styles.detailGrid}>
                <div className={styles.editor}>
                    <div className={`${styles.stage} ${styles.detailStage}`}>
                        <ExerciseAnimation motion={exercise.motion} label={`${exercise.name} demonstration`} />
                    </div>
                    <div className={styles.tagRow}>
                        <span className={styles.tag}>{exercise.equipment}</span>
                        {exercise.bodyweight ? <span className={styles.tag}>Bodyweight: log any added weight</span> : null}
                    </div>
                    <p className={styles.sectionLabel}>Form cues</p>
                    <ul className={styles.cues}>
                        {exercise.cues.map((cue) => <li key={cue}>{cue}</li>)}
                    </ul>
                </div>
                <div className={styles.editor}>
                    <MuscleMap primary={exercise.primary} secondary={exercise.secondary} />
                    <div className={styles.muscleLists}>
                        <p><strong>Primary</strong>{exercise.primary.map((m) => MUSCLE_LABELS[m]).join(", ")}</p>
                        {exercise.secondary.length ? <p><strong>Secondary</strong>{exercise.secondary.map((m) => MUSCLE_LABELS[m]).join(", ")}</p> : null}
                    </div>
                </div>
            </div>

            <p className={styles.sectionLabel}>Your progress</p>
            {logged ?
                <>
                    <div className={styles.prGrid}>
                        {records.heaviest && weighted ?
                            <div className={styles.pr}>
                                <p className={styles.prLabel}>Heaviest set</p>
                                <p className={styles.prValue}>{formatWeight(records.heaviest.weight_kg, unit)} × {records.heaviest.reps}</p>
                                <p className={styles.prDate}>{date(records.heaviest.performed_on)}</p>
                            </div>
                        : null}
                        {records.bestE1rm ?
                            <div className={styles.pr}>
                                <p className={styles.prLabel}>Best estimated 1RM</p>
                                <p className={styles.prValue}>{formatWeight(records.bestE1rm.e1rmKg, unit)}</p>
                                <p className={styles.prDate}>{date(records.bestE1rm.set.performed_on)}</p>
                            </div>
                        : null}
                        {records.mostReps ?
                            <div className={styles.pr}>
                                <p className={styles.prLabel}>Most reps in a set</p>
                                <p className={styles.prValue}>{records.mostReps.reps}{records.mostReps.weight_kg > 0 ? ` @ ${formatWeight(records.mostReps.weight_kg, unit)}` : ""}</p>
                                <p className={styles.prDate}>{date(records.mostReps.performed_on)}</p>
                            </div>
                        : null}
                    </div>
                    {weeks.some((w) => w.sets > 0) ?
                        <LineChart
                            height={170}
                            labels={weeks.map((w) => w.label)}
                            series={weighted
                                ? [{ name: "Best est. 1RM", tone: "primary", values: weeks.map((w) => w.bestE1rmKg === null ? null : fromKg(w.bestE1rmKg, unit)) }]
                                : [{ name: "Most reps", tone: "primary", values: weeks.map((w) => w.bestReps) }]}
                            format={(v) => weighted ? `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}` : `${v} reps`}
                            ariaLabel={`${exercise.name}: weekly best over the last 12 weeks`}
                        />
                    : <p className={styles.muted}>Nothing logged in the last 12 weeks.</p>}
                </>
            : <p className={styles.muted}>You haven&apos;t logged this exercise yet. Your records and weekly trend will show here.</p>}

            {onLogToday ?
                <div className={styles.buttonRow}>
                    <button type="button" className={styles.button} onClick={onLogToday}>Log it today</button>
                </div>
            : null}
        </Modal>
    )
}
