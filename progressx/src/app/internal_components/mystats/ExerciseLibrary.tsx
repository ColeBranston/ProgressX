"use client";

import styles from "./workouts.module.css";
import ExerciseAnimation from "./ExerciseAnimation";
import { ExerciseFilterBar, useExerciseFilter } from "./ExerciseFilters";
import { MUSCLE_LABELS } from "./exercises";

type ExerciseLibraryProps = {
    onOpen: (exerciseId: string) => void,
}

export default function ExerciseLibrary({ onOpen }: ExerciseLibraryProps) {
    const { query, setQuery, group, setGroup, results } = useExerciseFilter()

    return (
        <>
            <ExerciseFilterBar query={query} onQuery={setQuery} group={group} onGroup={setGroup} />
            {results.length === 0 ?
                <p className={`${styles.muted} ${styles.emptyResults}`}>No exercises match &ldquo;{query}&rdquo;.</p>
            :
                <div className={styles.libraryGrid}>
                    {results.map((exercise) => (
                        <button key={exercise.id} type="button" className={styles.exerciseCard} onClick={() => onOpen(exercise.id)}>
                            <div className={styles.stage}>
                                <ExerciseAnimation motion={exercise.motion} label={`${exercise.name} demonstration`} />
                            </div>
                            <p className={styles.exerciseName}>{exercise.name}</p>
                            <div className={styles.tagRow}>
                                {exercise.primary.map((muscle) => <span key={muscle} className={`${styles.tag} ${styles.tagPrimary}`}>{MUSCLE_LABELS[muscle]}</span>)}
                                <span className={styles.tag}>{exercise.equipment}</span>
                            </div>
                        </button>
                    ))}
                </div>
            }
        </>
    )
}
