"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import pageStyles from "@/app/(main)/mystats/mystats.module.css";
import styles from "./workouts.module.css";
import { BarChart, ChartCard, Heatmap, LegendItem, LineChart, StatTile, compactNumber } from "./charts";
import { EXERCISE_BY_ID, MUSCLE_GROUPS, MuscleGroup, WeightUnit, formatWeight, fromKg } from "./exercises";
import { WorkoutSet, exerciseWeeks, muscleGroupWeeklySets, personalRecords, recentWeeks, weeklySessions } from "./workoutStats";

const RANGES = [
    { weeks: 8, label: "8 weeks" },
    { weeks: 12, label: "12 weeks" },
    { weeks: 26, label: "6 months" },
    { weeks: 52, label: "1 year" },
]

// Weekly working sets per muscle group that count as a full week (a common 10-20 set guideline)
const GROUP_SET_GOAL = 12

type WorkoutProgressProps = {
    sets: WorkoutSet[],
    unit: WeightUnit,
    onOpenExercise: (exerciseId: string) => void,
    onGoToLog: () => void,
}

export default function WorkoutProgress({ sets, unit, onOpenExercise, onGoToLog }: WorkoutProgressProps) {
    const [ weeksCount, setWeeksCount ] = useState(12)
    const weeks = useMemo(() => recentWeeks(weeksCount), [weeksCount])
    const firstDay = weeks[0].format("YYYY-MM-DD")
    const inRange = useMemo(() => sets.filter((s) => s.performed_on >= firstDay), [sets, firstDay])

    // Exercises with logged sets, most recently trained first
    const logged = useMemo(() => {
        const last = new Map<string, string>()
        for (const s of sets) if (EXERCISE_BY_ID[s.exercise_id] && (!last.has(s.exercise_id) || s.performed_on > last.get(s.exercise_id)!)) last.set(s.exercise_id, s.performed_on)
        return Array.from(last.entries()).sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id)
    }, [sets])

    const [ selected, setSelected ] = useState<string | null>(null)
    const exerciseId = selected && logged.includes(selected) ? selected : logged[0] ?? null
    const exercise = exerciseId ? EXERCISE_BY_ID[exerciseId] : null

    const exWeeks = useMemo(() => exerciseId ? exerciseWeeks(sets, exerciseId, weeks) : [], [sets, exerciseId, weeks])
    const records = useMemo(() => exerciseId ? personalRecords(sets, exerciseId) : null, [sets, exerciseId])
    const sessions = useMemo(() => weeklySessions(inRange, weeks), [inRange, weeks])
    const groupSets = useMemo(() => muscleGroupWeeklySets(inRange, weeks), [inRange, weeks])

    if (logged.length === 0 || !exercise || !exerciseId) {
        return (
            <div className={pageStyles.empty}>
                <p className={pageStyles.emptyTitle}>No workouts logged yet</p>
                <p className={pageStyles.emptyText}>Log a few sets and you&apos;ll see your strength, volume and records climb week over week.</p>
                <button type="button" className={pageStyles.primaryButton} onClick={onGoToLog}>Log a workout</button>
            </div>
        )
    }

    const weighted = !exercise.bodyweight || sets.some((s) => s.exercise_id === exerciseId && s.weight_kg > 0)
    const w = (kg: number) => fromKg(kg, unit)
    const fmtWeight = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`

    // The tiles show the latest week this exercise was trained (this week, or an earlier one early in the
    // week) against the trained week before it, so a skipped week doesn't hide progress
    const trainedIndexes = exWeeks.map((week, i) => (week.sets > 0 ? i : -1)).filter((i) => i >= 0)
    const currentIndex = trainedIndexes[trainedIndexes.length - 1] ?? exWeeks.length - 1
    const current = exWeeks[currentIndex]
    const lastTrained = trainedIndexes.length > 1 ? exWeeks[trainedIndexes[trainedIndexes.length - 2]] : null
    const isThisWeek = currentIndex === exWeeks.length - 1
    const weekName = isThisWeek ? "this week" : `week of ${current.label}`

    const delta = (now: number | null, before: number | null, format: (v: number) => string) => {
        if (now === null || before === null || !lastTrained) return null
        const diff = now - before
        if (Math.abs(diff) < 0.05) return { text: `no change vs week of ${lastTrained.label}`, good: null }
        return { text: `${diff > 0 ? "+" : "−"}${format(Math.abs(diff))} vs week of ${lastTrained.label}`, good: diff > 0 }
    }

    const volume = (week: typeof current) => weighted ? w(week.volumeKg) : week.totalReps
    const volumeFormat = (v: number) => weighted ? `${compactNumber(v)} ${unit}` : `${Math.round(v)} reps`
    const thisWeekSessions = sessions[sessions.length - 1]
    const groups = Object.keys(MUSCLE_GROUPS) as MuscleGroup[]
    const date = (value: string) => dayjs(value).format("MMM D, YYYY")

    return (
        <>
            <div className={pageStyles.filterRow}>
                <span className={pageStyles.filterLabel} id="progress-range">Range</span>
                <div className={pageStyles.segmented} role="radiogroup" aria-labelledby="progress-range">
                    {RANGES.map((range) => (
                        <button key={range.weeks} type="button" role="radio" aria-checked={weeksCount === range.weeks} onClick={() => setWeeksCount(range.weeks)}>{range.label}</button>
                    ))}
                </div>
                <label className={styles.dateNav}>
                    <span className={pageStyles.filterLabel}>Exercise</span>
                    <select className={styles.select} value={exerciseId} onChange={(e) => setSelected(e.target.value)}>
                        {logged.map((id) => <option key={id} value={id}>{EXERCISE_BY_ID[id].name}</option>)}
                    </select>
                </label>
                <button type="button" className={styles.ghostButton} onClick={() => onOpenExercise(exerciseId)}>How to do it</button>
            </div>

            <section className={pageStyles.tiles} aria-label={`${exercise.name} this week`}>
                {weighted ?
                    <>
                        <StatTile
                            label={`Best est. 1RM ${weekName}`}
                            value={current.bestE1rmKg === null ? "—" : String(w(current.bestE1rmKg))}
                            unit={current.bestE1rmKg === null ? undefined : unit}
                            delta={delta(current.bestE1rmKg === null ? null : w(current.bestE1rmKg), lastTrained?.bestE1rmKg == null ? null : w(lastTrained.bestE1rmKg), fmtWeight)}
                        />
                        <StatTile
                            label={`Top set ${weekName}`}
                            value={current.topWeightKg === null ? "—" : String(w(current.topWeightKg))}
                            unit={current.topWeightKg === null ? undefined : unit}
                            delta={delta(current.topWeightKg === null ? null : w(current.topWeightKg), lastTrained?.topWeightKg == null ? null : w(lastTrained.topWeightKg), fmtWeight)}
                        />
                    </>
                :
                    <StatTile
                        label={`Most reps ${weekName}`}
                        value={current.bestReps === null ? "—" : String(current.bestReps)}
                        delta={delta(current.bestReps, lastTrained?.bestReps ?? null, (v) => `${Math.round(v)} reps`)}
                    />
                }
                <StatTile
                    label={`Volume ${weekName}`}
                    value={current.sets ? volumeFormat(volume(current)) : "—"}
                    delta={current.sets && lastTrained ? delta(volume(current), volume(lastTrained), volumeFormat) : null}
                    caption={`${current.sets} ${current.sets === 1 ? "set" : "sets"}${lastTrained ? ` · ${lastTrained.sets} the week before` : ""}`}
                />
                <StatTile
                    label="Workouts this week"
                    value={String(thisWeekSessions.sessions)}
                    caption={`${thisWeekSessions.sets} ${thisWeekSessions.sets === 1 ? "set" : "sets"} across all exercises`}
                />
            </section>

            <div className={pageStyles.grid2}>
                <ChartCard
                    className={pageStyles.span2}
                    title={weighted ? "Strength trend" : "Reps trend"}
                    subtitle={weighted
                        ? `${exercise.name}: your best estimated one-rep max and heaviest set each week`
                        : `${exercise.name}: your best set each week`}
                    legend={weighted ? <><LegendItem label="Best est. 1RM" kind="primary" /><LegendItem label="Top set weight" kind="muted" /></> : undefined}
                    table={{
                        columns: weighted ? ["Week of", "Best est. 1RM", "Top set", "Sets"] : ["Week of", "Most reps", "Sets"],
                        rows: [...exWeeks].reverse().filter((week) => week.sets > 0).map((week) => weighted
                            ? [week.label, formatWeight(week.bestE1rmKg ?? 0, unit), formatWeight(week.topWeightKg ?? 0, unit), String(week.sets)]
                            : [week.label, String(week.bestReps ?? 0), String(week.sets)]),
                    }}
                >
                    <LineChart
                        labels={exWeeks.map((week) => week.label)}
                        series={weighted
                            ? [
                                { name: "Best est. 1RM", tone: "primary", values: exWeeks.map((week) => week.bestE1rmKg === null ? null : w(week.bestE1rmKg)) },
                                { name: "Top set weight", tone: "muted", values: exWeeks.map((week) => week.topWeightKg === null ? null : w(week.topWeightKg)) },
                            ]
                            : [{ name: "Most reps", tone: "primary", values: exWeeks.map((week) => week.bestReps) }]}
                        format={weighted ? fmtWeight : (v) => `${Math.round(v)} reps`}
                        ariaLabel={`${exercise.name} weekly strength trend`}
                    />
                </ChartCard>

                <ChartCard
                    title="Weekly volume"
                    subtitle={weighted ? `Weight × reps across every ${exercise.name} set` : `Total ${exercise.name} reps`}
                    table={{ columns: ["Week of", "Volume", "Sets"], rows: [...exWeeks].reverse().map((week) => [week.label, week.sets ? volumeFormat(volume(week)) : "—", String(week.sets)]) }}
                >
                    <BarChart
                        data={exWeeks.map((week, i) => ({
                            key: week.key,
                            label: week.label,
                            value: week.sets ? volume(week) : null,
                            highlight: i === exWeeks.length - 1,
                            detail: `${week.sets} ${week.sets === 1 ? "set" : "sets"} · ${week.sessions} ${week.sessions === 1 ? "session" : "sessions"}`,
                        }))}
                        format={volumeFormat}
                        valueLabel="volume"
                        ariaLabel={`${exercise.name} weekly volume`}
                    />
                </ChartCard>

                <section className={styles.card} aria-label="Personal records">
                    <h3 className={styles.cardTitle}>Personal records</h3>
                    <div className={styles.prList}>
                        {records?.heaviest && weighted ?
                            <div className={styles.pr}>
                                <p className={styles.prLabel}>Heaviest set</p>
                                <p className={styles.prValue}>{formatWeight(records.heaviest.weight_kg, unit)} × {records.heaviest.reps}</p>
                                <p className={styles.prDate}>{date(records.heaviest.performed_on)}</p>
                            </div>
                        : null}
                        {records?.bestE1rm ?
                            <div className={styles.pr}>
                                <p className={styles.prLabel}>Best est. 1RM</p>
                                <p className={styles.prValue}>{formatWeight(records.bestE1rm.e1rmKg, unit)}</p>
                                <p className={styles.prDate}>{formatWeight(records.bestE1rm.set.weight_kg, unit)} × {records.bestE1rm.set.reps} · {date(records.bestE1rm.set.performed_on)}</p>
                            </div>
                        : null}
                        {records?.mostReps ?
                            <div className={styles.pr}>
                                <p className={styles.prLabel}>Most reps</p>
                                <p className={styles.prValue}>{records.mostReps.reps}{records.mostReps.weight_kg > 0 ? ` @ ${formatWeight(records.mostReps.weight_kg, unit)}` : ""}</p>
                                <p className={styles.prDate}>{date(records.mostReps.performed_on)}</p>
                            </div>
                        : null}
                        {records?.bestSession ?
                            <div className={styles.pr}>
                                <p className={styles.prLabel}>Biggest session</p>
                                <p className={styles.prValue}>{compactNumber(w(records.bestSession.volumeKg))} {unit}</p>
                                <p className={styles.prDate}>{date(records.bestSession.date)}</p>
                            </div>
                        : null}
                    </div>
                    <p className={styles.muted}>Estimated 1RM uses the Epley formula: weight × (1 + reps ÷ 30).</p>
                </section>

                <ChartCard
                    title="Workouts per week"
                    subtitle="Days with at least one set logged"
                    table={{ columns: ["Week of", "Workouts", "Sets"], rows: [...sessions].reverse().map((week) => [week.label, String(week.sessions), String(week.sets)]) }}
                >
                    <BarChart
                        data={sessions.map((week, i) => ({ key: week.key, label: week.label, value: week.sessions, highlight: i === sessions.length - 1, detail: `${week.sets} sets` }))}
                        format={(v) => `${Math.round(v)}`}
                        yMax={7}
                        valueLabel="workouts"
                        ariaLabel="Workouts per week"
                    />
                </ChartCard>

                <ChartCard
                    title="Sets per muscle group"
                    subtitle={`Working sets each week, counted toward each exercise's primary muscles. About ${GROUP_SET_GOAL}+ a week is a solid target.`}
                    table={{ columns: ["Muscle group", ...weeks.map((wk) => wk.format("MMM D"))], rows: groups.map((group) => [group, ...weeks.map((wk) => String(groupSets[group][wk.format("YYYY-MM-DD")] ?? 0))]) }}
                >
                    <Heatmap
                        rows={groups.map((group) => ({ key: group, label: group }))}
                        columns={weeks.map((wk) => ({ key: wk.format("YYYY-MM-DD"), label: wk.format("MMM D") }))}
                        ariaLabel="Working sets per muscle group each week"
                        legendLow="0 sets"
                        legendHigh={`${GROUP_SET_GOAL}+ sets`}
                        emptyLabel="Not trained"
                        cell={(group, key) => {
                            const count = groupSets[group as MuscleGroup][key] ?? 0
                            return count === 0
                                ? { value: null, display: "Not trained" }
                                : { value: Math.min(1, count / GROUP_SET_GOAL), display: `${count} ${count === 1 ? "set" : "sets"}` }
                        }}
                    />
                </ChartCard>
            </div>
        </>
    )
}
