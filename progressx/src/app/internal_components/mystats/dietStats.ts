import dayjs, { Dayjs } from "dayjs";
import { getDailyScore, ScoreCategory } from "../mydiet/DailyScore";
import { DayTotals, getScoreCategories, ScoreTargets } from "../mydiet/dietTargets";

// Turns the per-day totals from /api/stats/diet into daily scores and week-over-week averages.
// Weeks start on Sunday, like the diet page's week strip.

export type ApiDay = {
    date: string,
    foods: number,
    calories: number,
    protein: number,
    carbs: number,
    fats: number,
    micronutrients: Record<string, number>,
    waterMl: number,
}

export type DayStat = {
    date: Dayjs,
    key: string,
    tracked: boolean,      // anything logged (food or water)
    hasFood: boolean,
    totals: DayTotals,
    score: number | null,  // 0..1
    categories: ScoreCategory[],
}

export type WeekStat = {
    key: string,
    start: Dayjs,
    label: string,
    trackedDays: number,
    foodDays: number,
    daysInRange: number,
    score: number | null,
    categories: Record<string, number | null>,
    calories: number | null,
    protein: number | null,
    carbs: number | null,
    fats: number | null,
    waterMl: number | null,
    micros: Record<string, number | null>, // average consumed per food day
}

const EMPTY_TOTALS: DayTotals = { calories: 0, protein: 0, carbs: 0, fats: 0, micronutrients: {}, waterMl: 0 }

function average(values: number[]): number | null {
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
}

export function buildDayStats(from: Dayjs, to: Dayjs, apiDays: ApiDay[], targets: ScoreTargets): DayStat[] {
    const byDate = new Map(apiDays.map((day) => [day.date, day]))
    const days: DayStat[] = []

    for (let date = from.startOf("day"); !date.isAfter(to, "day"); date = date.add(1, "day")) {
        const key = date.format("YYYY-MM-DD")
        const raw = byDate.get(key)
        const totals: DayTotals = raw
            ? { calories: raw.calories, protein: raw.protein, carbs: raw.carbs, fats: raw.fats, micronutrients: raw.micronutrients, waterMl: raw.waterMl }
            : EMPTY_TOTALS
        const tracked = Boolean(raw && (raw.foods > 0 || raw.waterMl > 0))
        const categories = getScoreCategories(totals, targets)
        days.push({
            date,
            key,
            tracked,
            hasFood: Boolean(raw && raw.foods > 0),
            totals,
            categories,
            score: tracked ? getDailyScore(categories) : null,
        })
    }

    return days
}

export function buildWeekStats(days: DayStat[], microNames: string[]): WeekStat[] {
    const weeks = new Map<string, DayStat[]>()
    for (const day of days) {
        const key = day.date.startOf("week").format("YYYY-MM-DD")
        weeks.set(key, [...(weeks.get(key) ?? []), day])
    }

    return Array.from(weeks.entries()).map(([key, weekDays]) => {
        const tracked = weekDays.filter((day) => day.tracked)
        const food = weekDays.filter((day) => day.hasFood)
        const categoryNames = weekDays[0]?.categories.map((category) => category.label) ?? []

        return {
            key,
            start: dayjs(key),
            label: dayjs(key).format("MMM D"),
            trackedDays: tracked.length,
            foodDays: food.length,
            daysInRange: weekDays.length,
            score: average(tracked.map((day) => day.score ?? 0)),
            categories: Object.fromEntries(categoryNames.map((name) => [
                name,
                average(tracked.flatMap((day) => {
                    const fraction = day.categories.find((category) => category.label === name)?.fraction
                    return fraction === null || fraction === undefined ? [] : [Math.min(1, fraction)]
                })),
            ])),
            calories: average(food.map((day) => day.totals.calories)),
            protein: average(food.map((day) => day.totals.protein)),
            carbs: average(food.map((day) => day.totals.carbs)),
            fats: average(food.map((day) => day.totals.fats)),
            waterMl: average(tracked.map((day) => day.totals.waterMl)),
            micros: Object.fromEntries(microNames.map((name) => [name, average(food.map((day) => day.totals.micronutrients[name] ?? 0))])),
        }
    })
}

// Signed change between two numbers, formatted by `format`; null when either side is missing
export function change(current: number | null, previous: number | null, format: (value: number) => string) {
    if (current === null || previous === null) return null
    const diff = current - previous
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±"
    return { diff, text: `${sign}${format(Math.abs(diff))}` }
}
