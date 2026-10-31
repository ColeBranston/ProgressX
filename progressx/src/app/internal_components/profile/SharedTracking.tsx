"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import dayjs from "dayjs";
import styles from "./SharedTracking.module.css";
import { Bone, SkeletonStatus } from "../skeleton/Skeleton";
import { cloudinaryLoader, cloudinaryPlaceholder, cloudinaryThumbLoader } from "./cloudinaryImage";
import { ChartCard, LineChart, StatTile } from "../mystats/charts";
import { EXERCISE_BY_ID } from "../mystats/exercises";
import { formatWeight, WeightPeriod, WeightUnit } from "../weight/weightLog";
import AnalyticsBar from "../mydiet/AnalyticsBar";
import { backdrop } from "../a11y";
import type { ShareKind } from "./sharing";

// What someone chose to show on their public profile (Settings > Profile privacy), read-only, for
// signed-in viewers. Each tab loads its own data from /api/profiles/:username/tracking/:kind.

type Load<T> = { state: "loading" } | { state: "error" } | { state: "ready", data: T }

function useTracking<T>(username: string, kind: ShareKind, query: string): Load<T> {
    const [ load, setLoad ] = useState<Load<T>>({ state: "loading" })
    useEffect(() => {
        let cancelled = false
        setLoad({ state: "loading" })
        fetch(`/api/profiles/${encodeURIComponent(username)}/tracking/${kind}${query ? `?${query}` : ""}`, { cache: "no-store" })
            .then(async (res) => {
                if (!res.ok) throw new Error(`status ${res.status}`)
                const data = await res.json()
                if (!cancelled) setLoad({ state: "ready", data })
            })
            .catch(() => { if (!cancelled) setLoad({ state: "error" }) })
        return () => { cancelled = true }
    }, [username, kind, query])
    return load
}

function Status({ load, what }: { load: Load<unknown>, what: string }) {
    return load.state === "loading"
        ? <SkeletonStatus label={`Loading ${what}`} className={styles.skeleton}>
            <div className={styles.tiles}>
                {Array.from({ length: 3 }, (_, i) => <div key={i} className={styles.card}><Bone width="50%" height={12} /><Bone width="70%" height={24} /></div>)}
            </div>
            <div className={styles.card}><Bone width="40%" height={16} /><Bone width="100%" height={160} radius={12} /></div>
        </SkeletonStatus>
        : <p className={styles.empty}>Couldn&apos;t load {what}. Try again later.</p>
}

export default function SharedTracking({ username, kind }: { username: string, kind: ShareKind }) {
    if (kind === "photos") return <SharedPhotos username={username} />
    if (kind === "weight") return <SharedWeight username={username} />
    if (kind === "workouts") return <SharedWorkouts username={username} />
    return <SharedDiet username={username} />
}

type Photo = { id: string, imageLink: string, description: string | null, createdAt: string }

function SharedPhotos({ username }: { username: string }) {
    const load = useTracking<{ photos: Photo[] }>(username, "photos", "")
    const [ open, setOpen ] = useState<Photo | null>(null)

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null) }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [open])

    if (load.state !== "ready") return <Status load={load} what="progress photos" />
    if (!load.data.photos.length) return <p className={styles.empty}>@{username} hasn&apos;t added any progress photos yet.</p>

    return (
        <>
            <div className={styles.photoGrid}>
                {load.data.photos.map((photo) => {
                    const date = dayjs(photo.createdAt).format("MMM D, YYYY")
                    return (
                        <button key={photo.id} type="button" className={styles.photoTile} onClick={() => setOpen(photo)} aria-label={`Open progress photo from ${date}`}
                            style={{ backgroundImage: `url(${cloudinaryPlaceholder(photo.imageLink)})` }}>
                            <Image loader={cloudinaryThumbLoader} src={photo.imageLink} alt="" fill sizes="(max-width: 768px) 33vw, 220px" className={styles.photoImage} />
                            <span className={styles.photoDate}>{date}</span>
                        </button>
                    )
                })}
            </div>
            {open ?
                <div className={styles.overlay} {...backdrop(() => setOpen(null))}>
                    <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={`Progress photo from ${dayjs(open.createdAt).format("MMMM D, YYYY")}`}>
                        <div className={styles.viewerHeader}>
                            <p>{dayjs(open.createdAt).format("MMMM D, YYYY")}</p>
                            <button type="button" className={styles.closeButton} onClick={() => setOpen(null)} aria-label="Close">×</button>
                        </div>
                        <div className={styles.viewerImage}>
                            <Image loader={cloudinaryLoader} src={open.imageLink} alt={`Progress photo from ${dayjs(open.createdAt).format("MMMM D, YYYY")}`} fill sizes="(max-width: 900px) 100vw, 800px" className={styles.photoImageContain} />
                        </div>
                        {open.description ? <p className={styles.viewerCaption}>{open.description}</p> : null}
                    </div>
                </div>
            : null}
        </>
    )
}

type WeightResponse = { entries: { date: string, period: WeightPeriod, weightKg: number }[], weightUnit: WeightUnit }

const WEIGHT_DAYS = 90

function SharedWeight({ username }: { username: string }) {
    const query = useMemo(() => {
        const today = dayjs()
        return `from=${today.subtract(WEIGHT_DAYS - 1, "day").format("YYYY-MM-DD")}&to=${today.format("YYYY-MM-DD")}`
    }, [])
    const load = useTracking<WeightResponse>(username, "weight", query)

    const series = useMemo(() => {
        if (load.state !== "ready") return null
        // one point per day: the morning weigh-in, or the night one on days without a morning one
        const byDay = new Map<string, number>()
        for (const entry of load.data.entries) {
            if (entry.period === "morning" || !byDay.has(entry.date)) byDay.set(entry.date, entry.weightKg)
        }
        const start = dayjs().subtract(WEIGHT_DAYS - 1, "day")
        const days = Array.from({ length: WEIGHT_DAYS }, (_, i) => start.add(i, "day"))
        return { days, values: days.map((day) => byDay.get(day.format("YYYY-MM-DD")) ?? null), logged: byDay.size }
    }, [load])

    if (load.state !== "ready" || !series) return <Status load={load} what="weight" />
    if (!series.logged) return <p className={styles.empty}>@{username} hasn&apos;t logged a weigh-in in the last {WEIGHT_DAYS} days.</p>

    const unit = load.data.weightUnit
    const logged = series.values.filter((v): v is number => v !== null)
    const latest = logged[logged.length - 1]
    const first = logged[0]
    const diff = latest - first

    return (
        <div className={styles.stack}>
            <div className={styles.tiles}>
                <StatTile label="Latest weigh-in" value={formatWeight(latest, unit, false)} unit={unit} />
                <StatTile label={`Change over ${WEIGHT_DAYS} days`} value={`${diff > 0 ? "+" : ""}${formatWeight(diff, unit, false)}`} unit={unit} caption={`${series.logged} days logged`} />
            </div>
            <ChartCard
                title="Weight"
                subtitle={`Last ${WEIGHT_DAYS} days, in ${unit}`}
                table={{ columns: ["Day", "Weight"], rows: series.days.flatMap((day, i) => series.values[i] === null ? [] : [[day.format("ddd, MMM D"), formatWeight(series.values[i]!, unit)]]).reverse() }}
            >
                <LineChart
                    labels={series.days.map((day) => day.format("MMM D"))}
                    series={[{ name: "Weight", tone: "primary", values: series.values.map((kg) => kg === null ? null : Number(formatWeight(kg, unit, false))) }]}
                    format={(v) => `${v} ${unit}`}
                    zoom={{ minSpan: unit === "kg" ? 4 : 8 }}
                    connectGaps
                    ariaLabel={`@${username}'s weight over the last ${WEIGHT_DAYS} days`}
                />
            </ChartCard>
        </div>
    )
}

type WorkoutsResponse = { sets: { id: string, exerciseId: string, performedOn: string, weightKg: number, reps: number }[], weightUnit: WeightUnit }

const WORKOUT_DAYS = 28

function SharedWorkouts({ username }: { username: string }) {
    const query = useMemo(() => {
        const today = dayjs()
        return `from=${today.subtract(WORKOUT_DAYS - 1, "day").format("YYYY-MM-DD")}&to=${today.format("YYYY-MM-DD")}`
    }, [])
    const load = useTracking<WorkoutsResponse>(username, "workouts", query)

    // newest day first; within a day, exercises in the order they were first logged
    const days = useMemo(() => {
        if (load.state !== "ready") return []
        const result: { date: string, exercises: { id: string, sets: WorkoutsResponse["sets"] }[] }[] = []
        for (const set of load.data.sets) {
            let day = result.find((d) => d.date === set.performedOn)
            if (!day) result.push(day = { date: set.performedOn, exercises: [] })
            let exercise = day.exercises.find((e) => e.id === set.exerciseId)
            if (!exercise) day.exercises.push(exercise = { id: set.exerciseId, sets: [] })
            exercise.sets.push(set)
        }
        return result.sort((a, b) => b.date.localeCompare(a.date))
    }, [load])

    if (load.state !== "ready") return <Status load={load} what="workouts" />
    if (!days.length) return <p className={styles.empty}>@{username} hasn&apos;t logged a workout in the last {WORKOUT_DAYS} days.</p>

    const unit = load.data.weightUnit
    return (
        <div className={styles.stack}>
            <p className={styles.note}>Last {WORKOUT_DAYS} days · {days.length} {days.length === 1 ? "day" : "days"} trained</p>
            {days.map((day) => (
                <section key={day.date} className={styles.card} aria-label={dayjs(day.date).format("dddd, MMMM D")}>
                    <h3 className={styles.cardTitle}>{dayjs(day.date).format("dddd, MMM D")}</h3>
                    <ul className={styles.exerciseList}>
                        {day.exercises.map((exercise) => {
                            const info = EXERCISE_BY_ID[exercise.id]
                            return (
                                <li key={exercise.id}>
                                    <span className={styles.exerciseName}>{info?.name ?? "Exercise"}</span>
                                    <span className={styles.sets}>
                                        {exercise.sets.map((set) => `${set.reps} × ${set.weightKg === 0 && info?.bodyweight ? "bodyweight" : formatWeight(set.weightKg, unit)}`).join(" · ")}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            ))}
        </div>
    )
}

type DietEntry = { id: string, name: string, servingQty: number, servingUnit: string, calories: number, proteinG: number, carbsG: number, fatsG: number }
type DietResponse = { date: string, entries: DietEntry[], targets: { calories: number, protein: number, carbs: number, fats: number, goal: string } | null }

function SharedDiet({ username }: { username: string }) {
    const today = useMemo(() => dayjs().startOf("day"), [])
    const [ date, setDate ] = useState(today)
    const load = useTracking<DietResponse>(username, "diet", `date=${date.format("YYYY-MM-DD")}`)

    const totals = useMemo(() => {
        const entries = load.state === "ready" ? load.data.entries : []
        return entries.reduce((sum, e) => ({ calories: sum.calories + e.calories, protein: sum.protein + e.proteinG, carbs: sum.carbs + e.carbsG, fats: sum.fats + e.fatsG }),
            { calories: 0, protein: 0, carbs: 0, fats: 0 })
    }, [load])

    const isToday = date.isSame(today, "day")
    const dayLabel = isToday ? "Today" : date.isSame(today.subtract(1, "day"), "day") ? "Yesterday" : date.format("ddd, MMM D")

    return (
        <div className={styles.stack}>
            <div className={styles.dayNav}>
                <button type="button" onClick={() => setDate(date.subtract(1, "day"))} aria-label="Previous day">‹</button>
                <p aria-live="polite">{dayLabel}</p>
                <button type="button" onClick={() => setDate(date.add(1, "day"))} disabled={isToday} aria-label="Next day">›</button>
            </div>

            {load.state !== "ready" ? <Status load={load} what="diet" />
            : !load.data.entries.length ? <p className={styles.empty}>Nothing logged {isToday ? "today" : "this day"}.</p>
            :
                <>
                    {load.data.targets ?
                        <section className={styles.card} aria-label="Against their targets">
                            <h3 className={styles.cardTitle}>Against their targets <span className={styles.goal}>{load.data.targets.goal}</span></h3>
                            <div className={styles.bars}>
                                <AnalyticsBar name="Calories" val={Math.round(totals.calories)} total={load.data.targets.calories} colour="red" measure="kCal" size="normal" />
                                <AnalyticsBar name="Protein" val={Math.round(totals.protein)} total={load.data.targets.protein} colour="red" measure="g" size="normal" />
                                <AnalyticsBar name="Carbohydrates" val={Math.round(totals.carbs)} total={load.data.targets.carbs} colour="red" measure="g" size="normal" />
                                <AnalyticsBar name="Fats" val={Math.round(totals.fats)} total={load.data.targets.fats} colour="red" measure="g" size="normal" />
                            </div>
                        </section>
                    : null}
                    <section className={styles.card} aria-label="Food log">
                        <h3 className={styles.cardTitle}>Food log</h3>
                        <ul className={styles.foodList}>
                            {load.data.entries.map((entry) => (
                                <li key={entry.id}>
                                    <span className={styles.foodName}>{entry.name}<span>{entry.servingQty} {entry.servingUnit}</span></span>
                                    <span className={styles.foodMacros}>
                                        <strong>{Math.round(entry.calories)} kCal</strong>
                                        <span>P {Math.round(entry.proteinG)} g · C {Math.round(entry.carbsG)} g · F {Math.round(entry.fatsG)} g</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </>
            }
        </div>
    )
}
