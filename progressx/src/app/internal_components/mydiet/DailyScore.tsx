"use client";

import { CSSProperties } from 'react'
import styles from './DailyScore.module.css'
import { clamp01, getDailyScore, ScoreCategory } from './dailyScoring'

export { averageCompletion, calorieGoalCompletion, getDailyScore } from './dailyScoring'
export type { ScoreCategory } from './dailyScoring'

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
