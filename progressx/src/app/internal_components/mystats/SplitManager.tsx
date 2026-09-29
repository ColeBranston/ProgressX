"use client";

import { useState } from "react";
import styles from "./workouts.module.css";
import ExerciseAnimation from "./ExerciseAnimation";
import ExercisePicker from "./ExercisePicker";
import { EXERCISE_BY_ID, MAX_DAY_EXERCISES, MAX_SPLIT_DAYS, SPLIT_TEMPLATES, SplitDay } from "./exercises";
import { WorkoutSplit } from "./workoutStats";

type Draft = { id: string | null, name: string, days: SplitDay[] }

type SplitManagerProps = {
    splits: WorkoutSplit[],
    onSave: (draft: Draft) => Promise<string | null>, // resolves to an error message, or null on success
    onDelete: (split: WorkoutSplit) => Promise<void>,
    onActivate: (split: WorkoutSplit) => Promise<void>,
}

const copyDays = (days: SplitDay[]): SplitDay[] => days.map((day) => ({ ...day, exercises: day.exercises.map((ex) => ({ ...ex })) }))

export default function SplitManager({ splits, onSave, onDelete, onActivate }: SplitManagerProps) {
    const [ draft, setDraft ] = useState<Draft | null>(null)
    const [ choosingTemplate, setChoosingTemplate ] = useState(splits.length === 0)
    const [ busyId, setBusyId ] = useState<string | null>(null)

    if (draft) {
        return <SplitEditor initial={draft} onCancel={() => setDraft(null)} onSave={async (next) => {
            const error = await onSave(next)
            if (!error) {
                setDraft(null)
                setChoosingTemplate(false)
            }
            return error
        }} />
    }

    async function run(split: WorkoutSplit, action: (split: WorkoutSplit) => Promise<void>) {
        setBusyId(split.id)
        try {
            await action(split)
        } finally {
            setBusyId(null)
        }
    }

    return (
        <>
            <div className={styles.cardHeader}>
                <p className={styles.muted}>
                    {splits.length ? "Your active split drives the workout suggested on the Log tab." : "Start from a template or build your own."}
                </p>
                {!choosingTemplate ? <button type="button" className={styles.button} onClick={() => setChoosingTemplate(true)}>New split</button> : null}
            </div>

            {choosingTemplate ?
                <section className={styles.card} aria-label="New split">
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>New split</h3>
                        {splits.length ? <button type="button" className={styles.ghostButton} onClick={() => setChoosingTemplate(false)}>Cancel</button> : null}
                    </div>
                    <div className={styles.templateGrid}>
                        {SPLIT_TEMPLATES.map((template) => (
                            <button key={template.name} type="button" className={styles.templateCard} onClick={() => setDraft({ id: null, name: template.name, days: copyDays(template.days) })}>
                                <strong>{template.name}</strong>
                                <span>{template.description}</span>
                                <span>{template.days.map((day) => day.name).join(" · ")}</span>
                            </button>
                        ))}
                        <button type="button" className={styles.templateCard} onClick={() => setDraft({ id: null, name: "My split", days: [{ name: "Day 1", exercises: [] }] })}>
                            <strong>Blank split</strong>
                            <span>Pick every exercise yourself</span>
                        </button>
                    </div>
                </section>
            : null}

            <div className={styles.splitList}>
                {splits.map((split) => (
                    <section key={split.id} className={`${styles.card} ${split.is_active ? styles.splitActive : ""}`} aria-label={split.name}>
                        <div className={styles.cardHeader}>
                            <h3 className={styles.cardTitle}>{split.name}</h3>
                            {split.is_active ? <span className={styles.badge}>Active</span> : null}
                        </div>
                        <ul className={styles.dayList}>
                            {split.days.map((day, i) => (
                                <li key={i}>
                                    <span>{day.name}</span>
                                    <span>{day.exercises.length} {day.exercises.length === 1 ? "exercise" : "exercises"}</span>
                                </li>
                            ))}
                        </ul>
                        <div className={styles.buttonRow}>
                            {!split.is_active ?
                                <button type="button" className={styles.button} disabled={busyId === split.id} onClick={() => run(split, onActivate)}>Make active</button>
                            : null}
                            <button type="button" className={styles.ghostButton} disabled={busyId === split.id} onClick={() => setDraft({ id: split.id, name: split.name, days: copyDays(split.days) })}>Edit</button>
                            <button
                                type="button"
                                className={styles.dangerButton}
                                disabled={busyId === split.id}
                                onClick={() => {
                                    if (window.confirm(`Delete "${split.name}"? Sets you've logged are kept.`)) run(split, onDelete)
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </section>
                ))}
            </div>
        </>
    )
}

// ---------- Editor ----------

type SplitEditorProps = {
    initial: Draft,
    onSave: (draft: Draft) => Promise<string | null>,
    onCancel: () => void,
}

function SplitEditor({ initial, onSave, onCancel }: SplitEditorProps) {
    const [ name, setName ] = useState(initial.name)
    const [ days, setDays ] = useState<SplitDay[]>(initial.days)
    const [ pickerDay, setPickerDay ] = useState<number | null>(null)
    const [ saving, setSaving ] = useState(false)
    const [ error, setError ] = useState<string | null>(null)

    const updateDay = (index: number, change: (day: SplitDay) => SplitDay) =>
        setDays((prev) => prev.map((day, i) => (i === index ? change(day) : day)))

    function move<T>(list: T[], from: number, to: number): T[] {
        if (to < 0 || to >= list.length) return list
        const next = [...list]
        const [item] = next.splice(from, 1)
        next.splice(to, 0, item)
        return next
    }

    async function save() {
        if (!name.trim()) return setError("Give your split a name.")
        if (days.some((day) => !day.name.trim())) return setError("Every day needs a name.")
        setSaving(true)
        setError(null)
        const message = await onSave({ id: initial.id, name: name.trim(), days })
        setSaving(false)
        if (message) setError(message)
    }

    return (
        <section className={`${styles.card} ${styles.editor}`} aria-label={initial.id ? "Edit split" : "New split"}>
            <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{initial.id ? "Edit split" : "New split"}</h3>
                <div className={styles.buttonRow}>
                    <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={saving}>Cancel</button>
                    <button type="button" className={styles.button} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save split"}</button>
                </div>
            </div>

            <input className={styles.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Split name" placeholder="Split name" />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}

            <div className={styles.editorDays}>
                {days.map((day, dayIndex) => (
                    <div key={dayIndex} className={styles.editorDay}>
                        <div className={styles.editorDayHeader}>
                            <input
                                className={styles.input}
                                value={day.name}
                                maxLength={40}
                                onChange={(e) => updateDay(dayIndex, (d) => ({ ...d, name: e.target.value }))}
                                aria-label={`Day ${dayIndex + 1} name`}
                            />
                            <button type="button" className={styles.iconButton} disabled={dayIndex === 0} onClick={() => setDays((prev) => move(prev, dayIndex, dayIndex - 1))} aria-label={`Move ${day.name} earlier`}>↑</button>
                            <button type="button" className={styles.iconButton} disabled={dayIndex === days.length - 1} onClick={() => setDays((prev) => move(prev, dayIndex, dayIndex + 1))} aria-label={`Move ${day.name} later`}>↓</button>
                            <button type="button" className={styles.iconButton} disabled={days.length === 1} onClick={() => setDays((prev) => prev.filter((_, i) => i !== dayIndex))} aria-label={`Remove ${day.name}`}>✕</button>
                        </div>

                        {day.exercises.length === 0 ? <p className={styles.muted}>No exercises yet.</p> : null}
                        {day.exercises.map((item, exIndex) => {
                            const exercise = EXERCISE_BY_ID[item.exerciseId]
                            if (!exercise) return null
                            const setItem = (change: Partial<typeof item>) => updateDay(dayIndex, (d) => ({ ...d, exercises: d.exercises.map((e, i) => (i === exIndex ? { ...e, ...change } : e)) }))
                            return (
                                <div key={`${item.exerciseId}-${exIndex}`} className={styles.editorRow}>
                                    <span className={styles.stage}><ExerciseAnimation motion={exercise.motion} label="" playing={false} /></span>
                                    <div style={{ minWidth: 0 }}>
                                        <p className={styles.editorRowName}>{exercise.name}</p>
                                        <div className={styles.editorRowFields}>
                                            <input
                                                className={`${styles.input} ${styles.setsInput}`}
                                                inputMode="numeric"
                                                value={item.sets || ""}
                                                onChange={(e) => {
                                                    const sets = Number(e.target.value.replace(/\D/g, "").slice(0, 2))
                                                    setItem({ sets: Math.min(10, sets) })
                                                }}
                                                onBlur={() => { if (!item.sets) setItem({ sets: 1 }) }}
                                                aria-label={`${exercise.name} sets`}
                                            />
                                            <span>sets ×</span>
                                            <input
                                                className={`${styles.input} ${styles.repsInput}`}
                                                value={item.reps}
                                                maxLength={12}
                                                onChange={(e) => setItem({ reps: e.target.value })}
                                                aria-label={`${exercise.name} reps`}
                                                placeholder="8-12"
                                            />
                                            <span>reps</span>
                                        </div>
                                    </div>
                                    <div className={styles.rowActions}>
                                        <button type="button" className={styles.iconButton} disabled={exIndex === 0} onClick={() => updateDay(dayIndex, (d) => ({ ...d, exercises: move(d.exercises, exIndex, exIndex - 1) }))} aria-label={`Move ${exercise.name} up`}>↑</button>
                                        <button type="button" className={styles.iconButton} disabled={exIndex === day.exercises.length - 1} onClick={() => updateDay(dayIndex, (d) => ({ ...d, exercises: move(d.exercises, exIndex, exIndex + 1) }))} aria-label={`Move ${exercise.name} down`}>↓</button>
                                        <button type="button" className={styles.iconButton} onClick={() => updateDay(dayIndex, (d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== exIndex) }))} aria-label={`Remove ${exercise.name}`}>✕</button>
                                    </div>
                                </div>
                            )
                        })}

                        <button type="button" className={styles.ghostButton} disabled={day.exercises.length >= MAX_DAY_EXERCISES} onClick={() => setPickerDay(dayIndex)}>+ Add exercise</button>
                    </div>
                ))}
            </div>

            <div className={styles.buttonRow}>
                <button
                    type="button"
                    className={styles.ghostButton}
                    disabled={days.length >= MAX_SPLIT_DAYS}
                    onClick={() => setDays((prev) => [...prev, { name: `Day ${prev.length + 1}`, exercises: [] }])}
                >
                    + Add day
                </button>
            </div>

            {pickerDay !== null ?
                <ExercisePicker
                    title={`Add to ${days[pickerDay]?.name || "day"}`}
                    exclude={days[pickerDay]?.exercises.map((e) => e.exerciseId)}
                    onClose={() => setPickerDay(null)}
                    onPick={(exerciseId) => {
                        updateDay(pickerDay, (d) => ({ ...d, exercises: [...d.exercises, { exerciseId, sets: 3, reps: "8-12" }] }))
                        setPickerDay(null)
                    }}
                />
            : null}
        </section>
    )
}
