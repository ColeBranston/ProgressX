"use client";

import { CSSProperties } from 'react'
import styles from './DailyScore.module.css'
import { goalType } from './CalorieTarget'

export type ScoreCategory = {
    label: string,
    fraction: number | null, // 0..1 of the target met, or null when there's nothing to track
    weight: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

type CompletionItem = { consumed: number, target: number, kind?: "target" | "limit" }

// How far past a limit (e.g. sodium) you are: 1 at or under it, shrinking the further you go over
function limitFactor({ consumed, target }: CompletionItem) {
    return consumed <= target ? 1 : clamp01(1 - (consumed - target) / target)
}

// Average of consumed / target for "target" items (each capped at 100%). "limit" items (sodium, cholesterol)
// never add credit, they only scale the result down when you go over them - so an empty day is
// still 0%, and 100% needs every target met AND every limit respected.
export function averageCompletion(items: CompletionItem[]): number | null {
    const tracked = items.filter((item) => item.target > 0)
    const targets = tracked.filter((item) => item.kind !== "limit")
    const limits = tracked.filter((item) => item.kind === "limit")
    if (tracked.length === 0) return null

    const base = targets.length > 0
        ? targets.reduce((sum, item) => sum + clamp01(item.consumed / item.target), 0) / targets.length
        : 1 // only limits are shown: staying under them is the whole goal
    return base * limits.reduce((factor, item) => factor * limitFactor(item), 1)
}

// Same goal ranges as the calorie meter (CalorieTarget): full marks inside the range,
// partial credit on the way up to it, and less the further past it you go
export function calorieGoalCompletion(consumed: number, totalExpenditure: number, goal: goalType): number | null {
    if (!(totalExpenditure > 0)) return null

    const ranges: Record<goalType, [number, number]> = {
        Deficit: [totalExpenditure - 1000, totalExpenditure - 1],
        Maintain: [totalExpenditure - 50, totalExpenditure + 50],
        Surplus: [totalExpenditure + 1, totalExpenditure + 500],
    }
    const [low, high] = ranges[goal]

    if (consumed < low) return clamp01(consumed / low)
    if (consumed <= high) return 1
    return clamp01(1 - (consumed - high) / high)
}

// Weighted average over the categories that are being tracked
export function getDailyScore(categories: ScoreCategory[]): number {
    const tracked = categories.filter((category) => category.fraction !== null)
    const totalWeight = tracked.reduce((sum, category) => sum + category.weight, 0)
    if (totalWeight === 0) return 0
    return tracked.reduce((sum, category) => sum + clamp01(category.fraction!) * category.weight, 0) / totalWeight
}

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

type DailyScoreProps = {
    categories: ScoreCategory[],
    isToday: boolean
}

export default function DailyScore({ categories, isToday }: DailyScoreProps) {
    const score = getDailyScore(categories)
    // floor so 100% only shows when every target is fully met
    const percent = Math.floor(score * 100 + 1e-9)
    const complete = percent >= 100
    const metCount = categories.filter((category) => category.fraction !== null && category.fraction >= 1).length
    const trackedCount = categories.filter((category) => category.fraction !== null).length

    return (
        <div className={`${styles.card} ${complete ? styles.complete : ""}`}>
            <div
                className={styles.ring}
                role="meter"
                aria-label="Daily score"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
            >
                <svg viewBox="0 0 120 120" className={styles.ringSvg}>
                    <circle className={styles.ringTrack} cx="60" cy="60" r={RADIUS} />
                    <circle
                        className={styles.ringFill}
                        cx="60" cy="60" r={RADIUS}
                        style={{ "--dash": CIRCUMFERENCE, "--offset": CIRCUMFERENCE * (1 - percent / 100) } as CSSProperties}
                    />
                </svg>
                <div className={styles.ringLabel}>
                    <span className={styles.percent}>{percent}<span className={styles.percentSign}>%</span></span>
                    <span className={styles.ringCaption}>Daily score</span>
                </div>
            </div>

            <div className={styles.breakdown}>
                <p className={styles.headline}>
                    {complete ? "All targets met" : `${metCount} of ${trackedCount} goals met ${isToday ? "today" : "this day"}`}
                </p>
                {categories.map((category) => {
                    const categoryPercent = category.fraction === null ? null : Math.floor(clamp01(category.fraction) * 100 + 1e-9)
                    return (
                        <div key={category.label} className={styles.row}>
                            <span className={styles.rowLabel}>{category.label}</span>
                            <div className={styles.rowBar}>
                                <div
                                    className={`${styles.rowFill} ${categoryPercent === 100 ? styles.rowFillDone : ""}`}
                                    style={{ width: `${categoryPercent ?? 0}%` }}
                                />
                            </div>
                            <span className={styles.rowValue}>{categoryPercent === null ? "—" : `${categoryPercent}%`}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
