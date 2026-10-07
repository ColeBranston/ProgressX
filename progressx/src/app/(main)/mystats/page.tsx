"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import styles from "./mystats.module.css";
import { userDataContext } from "@/app/contexts/userData";
import {
    formatVolume,
    getMacroTargets,
    getCalorieTarget,
    getMicronutrientTargets,
    getTotalExpenditure,
    getWaterTargetMl,
    goalType,
    weightKgFromProfile,
} from "@/app/internal_components/index";
import { BarChart, ChartCard, Heatmap, LineChart, StatTile } from "@/app/internal_components/mystats/charts";
import { ApiDay, buildDayStats, buildWeekStats, change, WeekStat } from "@/app/internal_components/mystats/dietStats";

const RANGES = [
    { weeks: 4, label: "4 weeks" },
    { weeks: 8, label: "8 weeks" },
    { weeks: 12, label: "12 weeks" },
    { weeks: 26, label: "6 months" },
]

type DietStatsResponse = {
    days: ApiDay[],
    goalState: goalType,
    displayedMicronutrients: string[],
    customWaterGoalMl: number | null,
}

// floored like the diet page's daily score ring, so 100% only shows when every target is fully met
const toPercent = (value: number) => Math.floor(value * 100 + 1e-9)
const pct = (value: number) => `${toPercent(value)}%`
const grams = (value: number) => `${Math.round(value)} g`
const kcal = (value: number) => `${Math.round(value).toLocaleString()} kCal`

export default function DietStatsPage() {
    const { userData } = useContext(userDataContext)
    const [ weeks, setWeeks ] = useState(8)
    const [ data, setData ] = useState<DietStatsResponse | null>(null)
    const [ loading, setLoading ] = useState(true)
    const [ error, setError ] = useState(false)

    const today = useMemo(() => dayjs(), [])
    const from = useMemo(() => today.startOf("week").subtract(weeks - 1, "week"), [today, weeks])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)

        fetch(`/api/stats/diet?from=${from.format("YYYY-MM-DD")}&to=${today.format("YYYY-MM-DD")}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`status ${res.status}`)
                const json = await res.json()
                if (!cancelled) setData(json)
            })
            .catch((err) => {
                console.error("Failed to load diet stats: ", err)
                if (!cancelled) setError(true)
            })
            .finally(() => { if (!cancelled) setLoading(false) })

        return () => { cancelled = true }
    }, [from, today])

    // Same targets the diet page scores against
    const targets = useMemo(() => {
        const weightKg = weightKgFromProfile(userData)
        const totalExpenditure = getTotalExpenditure(userData)
        const goal: goalType = data?.goalState ?? "Maintain"
        return {
            totalExpenditure,
            goal,
            macros: getMacroTargets(weightKg, getCalorieTarget(totalExpenditure, goal)),
            waterMl: data?.customWaterGoalMl ?? getWaterTargetMl({ weightLbs: userData.weight, gender: userData.gender, activity: userData.activity }),
            micros: getMicronutrientTargets(userData.gender, userData.age, data?.displayedMicronutrients),
        }
    }, [userData, data])

    const days = useMemo(() => data ? buildDayStats(from, today, data.days, targets) : [], [data, from, today, targets])
    const weekStats = useMemo(() => buildWeekStats(days, targets.micros.map((micro) => micro.name)), [days, targets.micros])

    if (!data) {
        return error
            ? <div className={styles.empty}><p className={styles.emptyTitle}>Couldn&apos;t load your stats</p><p className={styles.emptyText}>Check your connection and refresh the page.</p></div>
            : <div className={styles.loading} role="status" aria-label="Loading your stats"><span className={styles.spinner} /></div>
    }

    const trackedDays = days.filter((day) => day.tracked).length
    const thisWeek = weekStats[weekStats.length - 1]
    const lastWeek = weekStats.length > 1 ? weekStats[weekStats.length - 2] : null
    const goalCalories = getCalorieTarget(targets.totalExpenditure, targets.goal)

    const weekBars = (pick: (week: WeekStat) => number | null) => weekStats.map((week, i) => ({
        key: week.key,
        label: week.label,
        value: pick(week),
        highlight: i === weekStats.length - 1,
        detail: `${week.trackedDays}/${week.daysInRange} days logged${i === weekStats.length - 1 ? " · this week" : ""}`,
    }))

    // "closer to the target than last week" is the improvement for calories and protein
    const closer = (current: number | null, previous: number | null, target: number) =>
        current === null || previous === null || !target ? null : Math.abs(current - target) < Math.abs(previous - target)

    const scoreChange = change(thisWeek?.score ?? null, lastWeek?.score ?? null, (v) => `${toPercent(v)} pts`)
    const calorieChange = change(thisWeek?.calories ?? null, lastWeek?.calories ?? null, (v) => Math.round(v).toLocaleString())
    const proteinChange = change(thisWeek?.protein ?? null, lastWeek?.protein ?? null, (v) => `${Math.round(v)} g`)
    const waterChange = change(thisWeek?.waterMl ?? null, lastWeek?.waterMl ?? null, formatVolume)
    const vsLast = (text: string) => `${text} vs last week`

    const categoryNames = ["Calories", "Macros", "Water", "Micros"]
    const dayLabels = days.map((day) => day.date.format("MMM D"))

    return (
        <>
            <div className={styles.filterRow}>
                <span className={styles.filterLabel} id="range-label">Range</span>
                <div className={styles.segmented} role="radiogroup" aria-labelledby="range-label">
                    {RANGES.map((range) => (
                        <button key={range.weeks} type="button" role="radio" aria-checked={weeks === range.weeks} onClick={() => setWeeks(range.weeks)}>
                            {range.label}
                        </button>
                    ))}
                </div>
                {loading ? <span className={styles.filterLabel} role="status">Updating…</span> : null}
            </div>

            {trackedDays === 0 ?
                <div className={styles.empty}>
                    <p className={styles.emptyTitle}>No diet data yet</p>
                    <p className={styles.emptyText}>Log food or water on the diet page and your week-over-week trends will show up here.</p>
                    <Link href="/mydiet" className={styles.primaryLink}>Go to My Diet</Link>
                </div>
            :
            <>
                <section className={styles.tiles} aria-label="This week">
                    <StatTile
                        label="Avg daily score"
                        value={thisWeek?.score === null || !thisWeek ? "—" : String(toPercent(thisWeek.score))}
                        unit={thisWeek?.score === null ? undefined : "%"}
                        delta={scoreChange ? { text: vsLast(scoreChange.text), good: scoreChange.diff === 0 ? null : scoreChange.diff > 0 } : null}
                        caption={scoreChange ? undefined : "This week"}
                    />
                    <StatTile
                        label="Avg calories / day"
                        value={thisWeek?.calories == null ? "—" : Math.round(thisWeek.calories).toLocaleString()}
                        unit={thisWeek?.calories == null ? undefined : "kCal"}
                        delta={calorieChange ? { text: vsLast(calorieChange.text), good: calorieChange.diff === 0 ? null : closer(thisWeek?.calories ?? null, lastWeek?.calories ?? null, goalCalories) } : null}
                        caption={goalCalories ? `Goal ~${goalCalories.toLocaleString()} (${targets.goal.toLowerCase()})` : undefined}
                    />
                    <StatTile
                        label="Avg protein / day"
                        value={thisWeek?.protein == null ? "—" : String(Math.round(thisWeek.protein))}
                        unit={thisWeek?.protein == null ? undefined : "g"}
                        delta={proteinChange ? { text: vsLast(proteinChange.text), good: proteinChange.diff === 0 ? null : closer(thisWeek?.protein ?? null, lastWeek?.protein ?? null, targets.macros.protein) } : null}
                        caption={targets.macros.protein ? `Target ${targets.macros.protein} g` : undefined}
                    />
                    <StatTile
                        label="Avg water / day"
                        value={thisWeek?.waterMl == null ? "—" : formatVolume(thisWeek.waterMl)}
                        delta={waterChange ? { text: vsLast(waterChange.text), good: waterChange.diff === 0 ? null : closer(thisWeek?.waterMl ?? null, lastWeek?.waterMl ?? null, targets.waterMl) } : null}
                        caption={`Goal ${formatVolume(targets.waterMl)}`}
                    />
                    <StatTile
                        label="Days logged this week"
                        value={String(thisWeek?.trackedDays ?? 0)}
                        unit={`of ${thisWeek?.daysInRange ?? 7}${(thisWeek?.daysInRange ?? 7) < 7 ? " so far" : ""}`}
                        caption={`${trackedDays} ${trackedDays === 1 ? "day" : "days"} across ${weekStats.length} weeks`}
                    />
                </section>

                <div className={styles.grid2}>
                    <ChartCard
                        className={styles.span2}
                        title="Daily score"
                        subtitle="How much of each day's targets you hit. Gaps are days with nothing logged."
                        dimmed={loading}
                        table={{
                            columns: ["Day", "Score", ...categoryNames],
                            rows: days.filter((day) => day.tracked).reverse().map((day) => [
                                day.date.format("ddd, MMM D"),
                                pct(day.score ?? 0),
                                ...categoryNames.map((name) => {
                                    const fraction = day.categories.find((category) => category.label === name)?.fraction
                                    return fraction === null || fraction === undefined ? "—" : pct(Math.min(1, fraction))
                                }),
                            ]),
                        }}
                    >
                        <LineChart
                            labels={dayLabels}
                            series={[{ name: "Daily score", tone: "primary", values: days.map((day) => day.score === null ? null : toPercent(day.score)) }]}
                            format={(v) => `${Math.round(v)}%`}
                            yMax={100}
                            ariaLabel="Daily score over time, as a percentage"
                        />
                    </ChartCard>

                    <ChartCard
                        title="Weekly average score"
                        subtitle="Average over the days you logged"
                        dimmed={loading}
                        table={{ columns: ["Week of", "Avg score", "Days logged"], rows: [...weekStats].reverse().map((week) => [week.label, week.score === null ? "—" : pct(week.score), `${week.trackedDays}/${week.daysInRange}`]) }}
                    >
                        <BarChart data={weekBars((week) => week.score === null ? null : toPercent(week.score))} format={(v) => `${Math.round(v)}%`} yMax={100} valueLabel="avg score" ariaLabel="Average daily score per week" />
                    </ChartCard>

                    <ChartCard
                        title="Score breakdown"
                        subtitle="Weekly average of each part of the score"
                        dimmed={loading}
                        table={{
                            columns: ["Week of", ...categoryNames],
                            rows: [...weekStats].reverse().map((week) => [week.label, ...categoryNames.map((name) => week.categories[name] == null ? "—" : pct(week.categories[name]!))]),
                        }}
                    >
                        <div className={styles.smallMultiples}>
                            {categoryNames.map((name) => (
                                <div key={name}>
                                    <p className={styles.multipleTitle}>{name}</p>
                                    <BarChart
                                        height={120}
                                        data={weekBars((week) => week.categories[name] == null ? null : toPercent(week.categories[name]!))}
                                        format={(v) => `${Math.round(v)}%`}
                                        yMax={100}
                                        valueLabel={name.toLowerCase()}
                                        ariaLabel={`${name} score per week`}
                                    />
                                </div>
                            ))}
                        </div>
                    </ChartCard>

                    <ChartCard
                        title="Calories"
                        subtitle="Average per day with food logged"
                        dimmed={loading}
                        table={{ columns: ["Week of", "Avg / day", "Days with food"], rows: [...weekStats].reverse().map((week) => [week.label, week.calories === null ? "—" : kcal(week.calories), String(week.foodDays)]) }}
                    >
                        <BarChart
                            data={weekBars((week) => week.calories === null ? null : Math.round(week.calories))}
                            format={kcal}
                            valueLabel="avg / day"
                            target={goalCalories ? { value: goalCalories, label: `Goal ${goalCalories.toLocaleString()}` } : undefined}
                            ariaLabel="Average daily calories per week"
                        />
                    </ChartCard>

                    <ChartCard
                        title="Water"
                        subtitle="Average per logged day"
                        dimmed={loading}
                        table={{ columns: ["Week of", "Avg / day"], rows: [...weekStats].reverse().map((week) => [week.label, week.waterMl === null ? "—" : formatVolume(week.waterMl)]) }}
                    >
                        <BarChart
                            data={weekBars((week) => week.waterMl === null ? null : Math.round(week.waterMl))}
                            format={formatVolume}
                            valueLabel="avg / day"
                            target={{ value: targets.waterMl, label: `Goal ${formatVolume(targets.waterMl)}` }}
                            ariaLabel="Average daily water per week"
                        />
                    </ChartCard>

                    <ChartCard
                        className={styles.span2}
                        title="Macros"
                        subtitle="Average grams per day with food logged, against your daily targets"
                        dimmed={loading}
                        table={{
                            columns: ["Week of", "Protein", "Carbs", "Fats"],
                            rows: [...weekStats].reverse().map((week) => [week.label, ...[week.protein, week.carbs, week.fats].map((v) => v === null ? "—" : grams(v))]),
                        }}
                    >
                        <div className={styles.smallMultiples}>
                            {([
                                ["Protein", "protein", targets.macros.protein],
                                ["Carbs", "carbs", targets.macros.carbs],
                                ["Fats", "fats", targets.macros.fats],
                            ] as const).map(([label, field, target]) => (
                                <div key={field}>
                                    <p className={styles.multipleTitle}>{label}</p>
                                    <BarChart
                                        height={160}
                                        data={weekBars((week) => week[field] === null ? null : Math.round(week[field]!))}
                                        format={grams}
                                        valueLabel="avg / day"
                                        target={target > 0 ? { value: target, label: `${target} g` } : undefined}
                                        ariaLabel={`Average daily ${label.toLowerCase()} per week`}
                                    />
                                </div>
                            ))}
                        </div>
                    </ChartCard>

                    <ChartCard
                        className={styles.span2}
                        title="Micronutrients"
                        subtitle="Weekly average as a share of your daily target. Sodium and cholesterol are limits, so they only flag when you go over."
                        dimmed={loading}
                        table={{
                            columns: ["Nutrient", ...weekStats.map((week) => week.label)],
                            rows: targets.micros.map((micro) => [
                                `${micro.name} (${micro.measure})`,
                                ...weekStats.map((week) => {
                                    const avg = week.micros[micro.name]
                                    return avg === null || !micro.total ? "—" : `${Math.round(avg).toLocaleString()} (${Math.round((avg / micro.total) * 100)}%)`
                                }),
                            ]),
                        }}
                    >
                        {targets.micros.length ?
                            <Heatmap
                                rows={targets.micros.map((micro) => ({ key: micro.name, label: micro.name }))}
                                columns={weekStats.map((week) => ({ key: week.key, label: week.label }))}
                                ariaLabel="Micronutrient intake per week as a share of target"
                                cell={(name, weekKey) => {
                                    const micro = targets.micros.find((m) => m.name === name)!
                                    const week = weekStats.find((w) => w.key === weekKey)!
                                    const avg = week.micros[name]
                                    if (avg === null || !micro.total) return { value: null, display: "Nothing logged" }
                                    const share = avg / micro.total
                                    const amount = `${Math.round(avg).toLocaleString()} ${micro.measure}`
                                    if (micro.kind === "limit") {
                                        return share > 1
                                            ? { value: 1, over: true, display: `${amount} · ${Math.round(share * 100)}% of limit` }
                                            : { value: 1, display: `${amount} · under the ${micro.total.toLocaleString()} ${micro.measure} limit` }
                                    }
                                    return { value: Math.min(1, share), display: `${amount} · ${Math.round(share * 100)}% of target` }
                                }}
                            />
                        : <p className={styles.note}>No micronutrients selected. Choose which ones to track from the Micros settings on the diet page.</p>}
                    </ChartCard>
                </div>

                <p className={styles.note}>
                    Scores use your current profile, calorie goal ({targets.goal.toLowerCase()}) and micronutrient choices, the same way the diet page scores a day. Weekly averages only count days you logged something.
                </p>
            </>
            }
        </>
    )
}
