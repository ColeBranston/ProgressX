"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import styles from "./WeightCheckIn.module.css";
import { PERIOD_LABEL, WEIGHT_KG_RANGE, WEIGHT_PERIODS, WeightEntry, WeightPeriod, WeightUnit, formatWeight, fromDisplay, toDisplay } from "./weightLog";

type WeightCheckInProps = {
    dateKey: string, // the day shown on the diet page
    isToday: boolean,
}

const TREND_DAYS = 7

// Morning and night weigh-ins for the selected day, with the change since the day before and a
// small 7-day trend. Day-over-day charts live in My Stats > Weight.
export default function WeightCheckIn({ dateKey, isToday }: WeightCheckInProps) {
    const [ entries, setEntries ] = useState<WeightEntry[]>([])
    const [ unit, setUnit ] = useState<WeightUnit>("lb")
    const [ loaded, setLoaded ] = useState(false)
    const [ editing, setEditing ] = useState<WeightPeriod | null>(null)
    const [ draft, setDraft ] = useState("")
    const [ saving, setSaving ] = useState(false)
    const [ error, setError ] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // focus the field with the suggested weight selected, so typing replaces it
    useEffect(() => {
        if (editing) inputRef.current?.select()
    }, [editing])

    const from = useMemo(() => dayjs(dateKey).subtract(TREND_DAYS, "day").format("YYYY-MM-DD"), [dateKey])

    useEffect(() => {
        let cancelled = false
        setLoaded(false)
        setEditing(null)
        setError(null)
        fetch(`/api/weight?from=${from}&to=${dateKey}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`status ${res.status}`)
                const json = await res.json()
                if (cancelled) return
                setEntries(json.entries ?? [])
                setUnit(json.weightUnit === "kg" ? "kg" : "lb")
            })
            .catch((err) => console.error("Failed to load weight log: ", err))
            .finally(() => { if (!cancelled) setLoaded(true) })
        return () => { cancelled = true }
    }, [from, dateKey])

    const entryFor = (date: string, period: WeightPeriod) => entries.find((e) => e.date === date && e.period === period)
    const yesterday = dayjs(dateKey).subtract(1, "day").format("YYYY-MM-DD")

    // morning weights for the last week (night where there's no morning), oldest first
    const trend = useMemo(() => Array.from({ length: TREND_DAYS }, (_, i) => {
        const date = dayjs(dateKey).subtract(TREND_DAYS - 1 - i, "day").format("YYYY-MM-DD")
        const entry = entries.find((e) => e.date === date && e.period === "morning") ?? entries.find((e) => e.date === date && e.period === "night")
        return entry ? toDisplay(entry.weightKg, unit) : null
    }), [entries, dateKey, unit])

    function startEdit(period: WeightPeriod) {
        const current = entryFor(dateKey, period)
        // start from the most recent weight so a small change is a quick edit
        const latest = current ?? [...entries].sort((a, b) => (a.date + a.period).localeCompare(b.date + b.period)).pop()
        setDraft(latest ? (Math.round(toDisplay(latest.weightKg, unit) * 10) / 10).toFixed(1) : "")
        setError(null)
        setEditing(period)
    }

    async function save(period: WeightPeriod) {
        const value = Number(draft.replace(",", "."))
        const kg = fromDisplay(value, unit)
        if (!draft.trim() || !Number.isFinite(value) || kg < WEIGHT_KG_RANGE[0] || kg > WEIGHT_KG_RANGE[1]) {
            setError(`Enter your weight in ${unit}`)
            return
        }
        setSaving(true)
        setError(null)
        try {
            const res = await fetch("/api/weight", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: dateKey, period, weightKg: kg }),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok) throw new Error(json?.message ?? "Couldn't save your weight")
            setEntries((prev) => [...prev.filter((e) => !(e.date === dateKey && e.period === period)), json.entry])
            setEditing(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save your weight")
        } finally {
            setSaving(false)
        }
    }

    async function remove(period: WeightPeriod) {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/weight?date=${dateKey}&period=${period}`, { method: "DELETE" })
            if (!res.ok) throw new Error()
            setEntries((prev) => prev.filter((e) => !(e.date === dateKey && e.period === period)))
            setEditing(null)
        } catch {
            setError("Couldn't remove that weight")
        } finally {
            setSaving(false)
        }
    }

    const sparkline = (() => {
        const points = trend.map((v, i) => (v === null ? null : { i, v })).filter((p): p is { i: number, v: number } => p !== null)
        if (points.length < 2) return null
        const lo = Math.min(...points.map((p) => p.v))
        const hi = Math.max(...points.map((p) => p.v))
        const span = Math.max(hi - lo, unit === "kg" ? 1 : 2)
        const mid = (hi + lo) / 2
        const x = (i: number) => 4 + (i / (TREND_DAYS - 1)) * 112
        const y = (v: number) => 30 - ((v - (mid - span / 2)) / span) * 26
        return { d: points.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join("") }
    })()

    return (
        <div className={styles.checkIn}>
            <div className={styles.header}>
                <div>
                    <p className={styles.title}>Weigh-in</p>
                    <p className={styles.subtitle}>{isToday ? "Weigh yourself after waking up and before bed" : dayjs(dateKey).format("dddd, MMM D")}</p>
                </div>
                <Link href="/mystats/weight" className={styles.trendLink}>See trends →</Link>
            </div>

            <div className={styles.body}>
                {WEIGHT_PERIODS.map((period) => {
                    const entry = entryFor(dateKey, period)
                    const before = entryFor(yesterday, period)
                    const diff = entry && before ? toDisplay(entry.weightKg, unit) - toDisplay(before.weightKg, unit) : null
                    return (
                        <div key={period} className={styles.slot}>
                            <p className={styles.slotLabel}>
                                {period === "morning" ?
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                :   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>}
                                {PERIOD_LABEL[period]}
                            </p>
                            {editing === period ?
                                <form className={styles.editRow} onSubmit={(e) => { e.preventDefault(); save(period) }}>
                                    <div className={styles.inputWrap}>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            ref={inputRef}
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 6))}
                                            aria-label={`${PERIOD_LABEL[period]} weight in ${unit}`}
                                        />
                                        <span>{unit}</span>
                                    </div>
                                    <button type="submit" className={styles.saveButton} disabled={saving}>Save</button>
                                    <button type="button" className={styles.textButton} onClick={() => setEditing(null)}>Cancel</button>
                                </form>
                            : entry ?
                                <div className={styles.valueRow}>
                                    <button type="button" className={styles.value} onClick={() => startEdit(period)} aria-label={`${PERIOD_LABEL[period]} weight ${formatWeight(entry.weightKg, unit)}. Edit`}>
                                        {formatWeight(entry.weightKg, unit, false)}<span>{unit}</span>
                                    </button>
                                    {diff !== null ?
                                        <span className={`${styles.delta} ${Math.abs(diff) < 0.05 ? "" : diff > 0 ? styles.deltaUp : styles.deltaDown}`}>
                                            {Math.abs(diff) < 0.05 ? "same as" : `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} vs`} yesterday
                                        </span>
                                    : null}
                                    <button type="button" className={styles.textButton} onClick={() => remove(period)} disabled={saving} aria-label={`Remove ${period} weight`}>Remove</button>
                                </div>
                            :
                                <button type="button" className={styles.logButton} onClick={() => startEdit(period)} disabled={!loaded}>
                                    + Log {period} weight
                                </button>
                            }
                        </div>
                    )
                })}

                <div className={styles.trend} aria-label="Last 7 days">
                    <p className={styles.slotLabel}>Last 7 days</p>
                    {sparkline ?
                        // stretched to the box (the stroke keeps its width), so no end dot: it would turn oval
                        <svg viewBox="0 0 124 36" preserveAspectRatio="none" className={styles.sparkline} role="img" aria-label={`Weight over the last ${TREND_DAYS} days`}>
                            <path d={sparkline.d} />
                        </svg>
                    : <p className={styles.trendEmpty}>Log a few days to see your trend</p>}
                </div>
            </div>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
    )
}
