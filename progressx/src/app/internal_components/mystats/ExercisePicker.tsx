"use client";

import styles from "./workouts.module.css";
import Modal from "./Modal";
import ExerciseAnimation from "./ExerciseAnimation";
import { ExerciseFilterBar, muscleSummary, useExerciseFilter } from "./ExerciseFilters";

type ExercisePickerProps = {
    title?: string,
    exclude?: string[], // already added: shown but not pickable
    onPick: (exerciseId: string) => void,
    onClose: () => void,
}

export default function ExercisePicker({ title = "Add an exercise", exclude = [], onPick, onClose }: ExercisePickerProps) {
    const { query, setQuery, group, setGroup, results } = useExerciseFilter()
    const excluded = new Set(exclude)

    return (
        <Modal title={title} onClose={onClose}>
            <ExerciseFilterBar query={query} onQuery={setQuery} group={group} onGroup={setGroup} autoFocus />
            <div className={styles.pickList}>
                {results.length === 0 ? <p className={`${styles.muted} ${styles.emptyResults}`}>No exercises match &ldquo;{query}&rdquo;.</p> : null}
                {results.map((exercise) => {
                    const added = excluded.has(exercise.id)
                    return (
                        <button
                            key={exercise.id}
                            type="button"
                            className={styles.pickRow}
                            aria-disabled={added}
                            onClick={() => { if (!added) onPick(exercise.id) }}
                        >
                            <span className={`${styles.stage} ${styles.pickThumb}`}>
                                <ExerciseAnimation motion={exercise.motion} label="" playing={false} />
                            </span>
                            <span className={styles.pickText}>
                                <span className={styles.pickName}>{exercise.name}</span>
                                <span className={styles.pickMeta}>{added ? "Already added" : `${muscleSummary(exercise)} · ${exercise.equipment}`}</span>
                            </span>
                        </button>
                    )
                })}
            </div>
        </Modal>
    )
}
