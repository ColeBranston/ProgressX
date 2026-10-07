"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import styles from "../mystats.module.css";
import { ChartCard, LegendItem, LineChart, StatTile } from "@/app/internal_components/mystats/charts";
import { WeightEntry, WeightUnit, toDisplay } from "@/app/internal_components/weight/weightLog";

const RANGES = [
    { days: 30, label: "30 days" },
    { days: 90, label: "90 days" },
    { days: 182, label: "6 months" },
    { days: 365, label: "1 year" },
]

type Day = { key: string, date: dayjs.Dayjs, morning: number | null, night: number | null }

const avg = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null)

// Body weight, day over day: morning and night weigh-ins from the diet page
export default function WeightStatsPage() {
    const [ days, setDays ] = useState(90)
    const [ entries, setEntries ] = useState<WeightEntry[] | null>(null)
    const [ unit, setUnit ] = useState<WeightUnit>("lb")
    const [ loading, setLoading ] = useState(true)
    const [ error, setError ] = useState(false)

    const today = useMemo(() => dayjs(), [])
    // one extra week before the range so "vs the 7 days before" works from day one
    const from = useMemo(() => today.subtract(days - 1, "day"), [today, days])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        fetch(`/api/weight?from=${from.subtract(7, "day").format("YYYY-MM-DD")}&to=${today.format("YYYY-MM-DD")}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`status ${res.status}`)
                const json = await res.json()
                if (cancelled) return
                setEntries(json.entries ?? [])
                setUnit(json.weightUnit === "kg" ? "kg" : "lb")
            })
            .catch((err) => {
                console.error("Failed to load weight stats: ", err)
                if (!cancelled) setError(true)
            })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [from, today])

    // every day in the range (gaps stay gaps on the chart), weights in the user's unit
    const series = useMemo<Day[]>(() => {
        const byKey = new Map<string, Day>()
        for (let d = from.subtract(7, "day"); !d.isAfter(today, "day"); d = d.add(1, "day")) {
            byKey.set(d.format("YYYY-MM-DD"), { key: d.format("YYYY-MM-DD"), date: d, morning: null, night: null })
        }
        for (const entry of entries ?? []) {
            const day = byKey.get(entry.date)
            if (day) day[entry.period] = toDisplay(entry.weightKg, unit)
        }
        return [...byKey.values()]
    }, [entries, from, today, unit])

    if (!entries) {
        return error
            ? <div className={styles.empty}><p className={styles.emptyTitle}>Couldn&apos;t load your weight</p><p className={styles.emptyText}>Check your connection and refresh the page.</p></div>
            : <div className={styles.loading} role="status" aria-label="Loading your weight"><span className={styles.spinner} /></div>
    }

    const inRange = series.filter((day) => !day.date.isBefore(from, "day"))
    const logged = inRange.filter((day) => day.morning !== null || day.night !== null)
    const fmt = (v: number) => `${v.toFixed(1)} ${unit}`
    const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(1)} ${unit}`
    // the day's reference weight: morning (most consistent), night when there's no morning
    const main = (day: Day) => day.morning ?? day.night

    const latestDay = [...logged].reverse()[0]
    const firstDay = logged[0]
    const rangeChange = latestDay && firstDay && latestDay !== firstDay ? main(latestDay)! - main(firstDay)! : null

    const lastWeek = avg(series.slice(-7).map(main).filter((v): v is number => v !== null))
    const weekBefore = avg(series.slice(-14, -7).map(main).filter((v): v is number => v !== null))
    const swings = inRange.filter((day) => day.morning !== null && day.night !== null).map((day) => day.night! - day.morning!)
    const swing = avg(swings)

    const labels = inRange.map((day) => day.date.format("MMM D"))
    const hasNight = inRange.some((day) => day.night !== null)
    const minSpan = unit === "kg" ? 2 : 4

    return (
        <>
            <div className={styles.filterRow}>
                <span className={styles.filterLabel} id="weight-range-label">Range</span>
                <div className={styles.segmented} role="radiogroup" aria-labelledby="weight-range-label">
                    {RANGES.map((range) => (
                        <button key={range.days} type="button" role="radio" aria-checked={days === range.days} onClick={() => setDays(range.days)}>
                            {range.label}
                        </button>
                    ))}
                </div>
                {loading ? <span className={styles.filterLabel} role="status">Updating…</span> : null}
            </div>

            {logged.length === 0 ?
                <div className={styles.empty}>
                    <p className={styles.emptyTitle}>No weigh-ins yet</p>
                    <p className={styles.emptyText}>Log your weight in the morning and at night on the diet page, and your day-over-day trend will show up here.</p>
                    <Link href="/mydiet" className={styles.primaryLink}>Go to My Diet</Link>
                </div>
            :
            <>
                <section className={styles.tiles} aria-label="Weight summary">
                    <StatTile
                        label="Latest"
                        value={main(latestDay)!.toFixed(1)}
                        unit={unit}
                        caption={`${latestDay.morning !== null ? "Morning" : "Night"}, ${latestDay.date.isSame(today, "day") ? "today" : latestDay.date.format("MMM D")}`}
                    />
                    <StatTile
                        label={`Change over ${RANGES.find((r) => r.days === days)?.label}`}
                        value={rangeChange === null ? "—" : signed(rangeChange)}
                        caption={rangeChange === null ? "Needs two days of weigh-ins" : `Since ${firstDay.date.format("MMM D")} (${fmt(main(firstDay)!)})`}
                    />
                    <StatTile
                        label="7-day average"
                        value={lastWeek === null ? "—" : lastWeek.toFixed(1)}
                        unit={lastWeek === null ? undefined : unit}
                        // whether up or down is good depends on your goal, so this stays neutral
                        delta={lastWeek !== null && weekBefore !== null ? { text: `${signed(lastWeek - weekBefore)} vs the 7 days before`, good: null } : null}
                        caption={lastWeek !== null && weekBefore !== null ? undefined : "Last 7 days"}
                    />
                    <StatTile
                        label="Morning → night"
                        value={swing === null ? "—" : signed(swing)}
                        caption={swing === null ? "Log both on the same day to see this" : `Average daily swing over ${swings.length} ${swings.length === 1 ? "day" : "days"}`}
                    />
                    <StatTile
                        label="Days weighed"
                        value={String(logged.length)}
                        unit={`of ${inRange.length}`}
                        caption={`${inRange.filter((d) => d.morning !== null).length} mornings, ${inRange.filter((d) => d.night !== null).length} nights`}
                    />
                </section>

                <div className={styles.grid2}>
                    <ChartCard
                        className={styles.span2}
                        title="Weight, day over day"
                        subtitle="Morning weigh-ins are the most consistent for spotting trends. The line joins across days you didn't weigh in; hover for each day's numbers."
                        dimmed={loading}
                        legend={hasNight ? <><LegendItem label="Morning" kind="primary" /><LegendItem label="Night" kind="muted" /></> : undefined}
                        table={{
                            columns: ["Day", "Morning", "Night", "Night − morning"],
                            rows: [...logged].reverse().map((day) => [
                                day.date.format("ddd, MMM D"),
                                day.morning === null ? "—" : fmt(day.morning),
                                day.night === null ? "—" : fmt(day.night),
                                day.morning !== null && day.night !== null ? signed(day.night - day.morning) : "—",
                            ]),
                        }}
                    >
                        <LineChart
                            labels={labels}
                            series={[
                                { name: "Morning", tone: "primary", values: inRange.map((day) => day.morning) },
                                ...(hasNight ? [{ name: "Night", tone: "muted" as const, values: inRange.map((day) => day.night) }] : []),
                            ]}
                            format={fmt}
                            tickFormat={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
                            zoom={{ minSpan }}
                            connectGaps
                            height={260}
                            ariaLabel={`Morning${hasNight ? " and night" : ""} weight per day, in ${unit}`}
                        />
                    </ChartCard>
                </div>

                <p className={styles.note}>
                    Weight naturally moves 1–2% within a day (food, water, salt), so compare mornings with mornings. Change your unit in Settings.
                </p>
            </>
            }
        </>
    )
}
