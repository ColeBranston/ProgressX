"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import pageStyles from "../mystats.module.css";
import styles from "./workouts.module.css";
import ExerciseDetail from "@/app/internal_components/mystats/ExerciseDetail";
import ExerciseLibrary from "@/app/internal_components/mystats/ExerciseLibrary";
import SplitManager from "@/app/internal_components/mystats/SplitManager";
import WorkoutLog, { NewSet } from "@/app/internal_components/mystats/WorkoutLog";
import WorkoutProgress from "@/app/internal_components/mystats/WorkoutProgress";
import { SplitDay, WeightUnit } from "@/app/internal_components/mystats/exercises";
import { WorkoutSet, WorkoutSplit, normalizeSet } from "@/app/internal_components/mystats/workoutStats";

const TABS = [
    { id: "log", label: "Log" },
    { id: "splits", label: "Splits" },
    { id: "exercises", label: "Exercises" },
    { id: "progress", label: "Progress" },
] as const

type Tab = typeof TABS[number]["id"]

const HISTORY_DAYS = 730 // how far back sets are loaded (covers the 1 year progress range plus "last time")

async function readJson(res: Response) {
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.message ?? `status ${res.status}`)
    return json
}

export default function WorkoutsPage() {
    const [ tab, setTab ] = useState<Tab>("log")
    const [ splits, setSplits ] = useState<WorkoutSplit[]>([])
    const [ sets, setSets ] = useState<WorkoutSet[]>([])
    const [ unit, setUnit ] = useState<WeightUnit>("lb")
    const [ loading, setLoading ] = useState(true)
    const [ loadError, setLoadError ] = useState(false)
    const [ actionError, setActionError ] = useState<string | null>(null)

    const [ date, setDate ] = useState(() => dayjs().format("YYYY-MM-DD"))
    const [ extras, setExtras ] = useState<Record<string, string[]>>({})
    const [ dayChoices, setDayChoices ] = useState<Record<string, string>>({}) // workout picked for each date
    const [ detailId, setDetailId ] = useState<string | null>(null)

    // remember the tab in the URL (?tab=progress) so refreshes and shared links land on it
    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get("tab")
        if (TABS.some((t) => t.id === fromUrl)) setTab(fromUrl as Tab)
    }, [])

    const selectTab = useCallback((next: Tab) => {
        setTab(next)
        const url = new URL(window.location.href)
        url.searchParams.set("tab", next)
        window.history.replaceState(null, "", url)
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(false)
        try {
            const today = dayjs()
            const [ splitsJson, setsJson, settingsJson ] = await Promise.all([
                fetch("/api/workouts/splits").then(readJson),
                fetch(`/api/workouts/sets?from=${today.subtract(HISTORY_DAYS, "day").format("YYYY-MM-DD")}&to=${today.format("YYYY-MM-DD")}`).then(readJson),
                fetch("/api/user/settings").then(readJson),
            ])
            setSplits(splitsJson.splits ?? [])
            setSets((setsJson.sets ?? []).map(normalizeSet))
            setUnit(settingsJson.settings?.weightUnit === "kg" ? "kg" : "lb")
        } catch (err) {
            console.error("Failed to load workouts: ", err)
            setLoadError(true)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    async function changeUnit(next: WeightUnit) {
        const previous = unit
        setUnit(next)
        try {
            await fetch("/api/user/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ weightUnit: next }),
            }).then(readJson)
        } catch (err) {
            console.error("Failed to save weight unit: ", err)
            setUnit(previous)
        }
    }

    async function saveSplit(draft: { id: string | null, name: string, days: SplitDay[] }): Promise<string | null> {
        try {
            const json = await fetch(draft.id ? `/api/workouts/splits/${draft.id}` : "/api/workouts/splits", {
                method: draft.id ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: draft.name, days: draft.days }),
            }).then(readJson)
            setSplits((prev) => draft.id ? prev.map((s) => (s.id === json.split.id ? json.split : s)) : [...prev, json.split])
            return null
        } catch (err) {
            return err instanceof Error ? err.message : "Couldn't save the split"
        }
    }

    async function activateSplit(split: WorkoutSplit) {
        setActionError(null)
        try {
            const json = await fetch(`/api/workouts/splits/${split.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: true }),
            }).then(readJson)
            setSplits((prev) => prev.map((s) => (s.id === json.split.id ? json.split : { ...s, is_active: false })))
        } catch (err) {
            console.error("Failed to activate split: ", err)
            setActionError("Couldn't switch your active split. Try again.")
        }
    }

    async function deleteSplit(split: WorkoutSplit) {
        setActionError(null)
        try {
            await fetch(`/api/workouts/splits/${split.id}`, { method: "DELETE" }).then(readJson)
            setSplits((prev) => prev.filter((s) => s.id !== split.id))
            setSets((prev) => prev.map((s) => (s.split_id === split.id ? { ...s, split_id: null, split_day_index: null } : s)))
        } catch (err) {
            console.error("Failed to delete split: ", err)
            setActionError("Couldn't delete that split. Try again.")
        }
    }

    async function addSet(set: NewSet): Promise<boolean> {
        try {
            const json = await fetch("/api/workouts/sets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...set, performedOn: date }),
            }).then(readJson)
            setSets((prev) => [...prev, normalizeSet(json.set)])
            return true
        } catch (err) {
            console.error("Failed to log set: ", err)
            return false
        }
    }

    async function deleteSet(set: WorkoutSet) {
        setActionError(null)
        try {
            await fetch(`/api/workouts/sets/${set.id}`, { method: "DELETE" }).then(readJson)
            setSets((prev) => prev.filter((s) => s.id !== set.id))
        } catch (err) {
            console.error("Failed to delete set: ", err)
            setActionError("Couldn't delete that set. Try again.")
        }
    }

    async function deleteSets(toDelete: WorkoutSet[]): Promise<boolean> {
        setActionError(null)
        try {
            const json = await fetch("/api/workouts/sets", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: toDelete.map((s) => s.id) }),
            }).then(readJson)
            const deleted = new Set<string>(json.deleted ?? [])
            setSets((prev) => prev.filter((s) => !deleted.has(s.id)))
            return true
        } catch (err) {
            console.error("Failed to delete sets: ", err)
            setActionError("Couldn't remove those sets. Try again.")
            return false
        }
    }

    function addExtra(exerciseId: string, forDate = date) {
        setExtras((prev) => ({ ...prev, [forDate]: [...(prev[forDate] ?? []).filter((id) => id !== exerciseId), exerciseId] }))
    }

    if (loading) {
        return <div className={pageStyles.loading} role="status" aria-label="Loading your workouts"><span className={pageStyles.spinner} /></div>
    }

    if (loadError) {
        return (
            <div className={pageStyles.empty}>
                <p className={pageStyles.emptyTitle}>Couldn&apos;t load your workouts</p>
                <p className={pageStyles.emptyText}>Check your connection and try again.</p>
                <button type="button" className={pageStyles.primaryButton} onClick={load}>Retry</button>
            </div>
        )
    }

    return (
        <>
            <div className={styles.toolbar}>
                <div className={styles.subTabs} role="tablist" aria-label="Workouts">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            id={`tab-${t.id}`}
                            type="button"
                            role="tab"
                            aria-selected={tab === t.id}
                            aria-controls={`panel-${t.id}`}
                            onClick={() => selectTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className={pageStyles.segmented} role="radiogroup" aria-label="Weight unit">
                    {(["lb", "kg"] as const).map((u) => (
                        <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => changeUnit(u)}>{u}</button>
                    ))}
                </div>
            </div>

            {actionError ? <p className={pageStyles.errorText} role="alert">{actionError}</p> : null}

            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panel}>
                {tab === "log" ?
                    <WorkoutLog
                        date={date}
                        onDateChange={setDate}
                        choice={dayChoices[date]}
                        onChoiceChange={(value) => setDayChoices((prev) => ({ ...prev, [date]: value }))}
                        splits={splits}
                        sets={sets}
                        unit={unit}
                        extraExercises={extras[date] ?? []}
                        onAddExtra={(id) => addExtra(id)}
                        onAddSet={addSet}
                        onDeleteSet={deleteSet}
                        onDeleteSets={deleteSets}
                        onOpenExercise={setDetailId}
                        onGoToSplits={() => selectTab("splits")}
                    />
                : tab === "splits" ?
                    <SplitManager splits={splits} onSave={saveSplit} onDelete={deleteSplit} onActivate={activateSplit} />
                : tab === "exercises" ?
                    <ExerciseLibrary onOpen={setDetailId} />
                :
                    <WorkoutProgress sets={sets} unit={unit} onOpenExercise={setDetailId} onGoToLog={() => selectTab("log")} />
                }
            </div>

            {detailId ?
                <ExerciseDetail
                    exerciseId={detailId}
                    sets={sets}
                    unit={unit}
                    onClose={() => setDetailId(null)}
                    onLogToday={() => {
                        const today = dayjs().format("YYYY-MM-DD")
                        addExtra(detailId, today)
                        setDate(today)
                        setDetailId(null)
                        selectTab("log")
                    }}
                />
            : null}
        </>
    )
}
