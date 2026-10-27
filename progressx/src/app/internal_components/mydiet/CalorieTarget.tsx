"use client";

import { CSSProperties } from 'react';
import styles from './CalorieTarget.module.css'
import { getCalorieTarget } from './dietTargets';

export type goalType = ("Deficit" | "Maintain" | "Surplus")

type targetType = {
    curr?: number,
    totalExpenditure: number,
    goal?: goalType
}

const NUM_SEGMENTS = 11     // one labelled box per step, maintenance in the middle one
const STEP = 200            // kCal between neighbouring labels
const TARGET_BAND = 100     // the highlight covers the target ± this much, whatever the goal

// The bottom box is labelled maintenance - 1000 and the top one maintenance + 1000
export function meterLabels(totalExpenditure: number): number[] {
    const lowest = totalExpenditure - STEP * Math.floor(NUM_SEGMENTS / 2)
    return Array.from({ length: NUM_SEGMENTS }, (_, i) => Math.round(lowest + STEP * i)).reverse()
}

// How far up the meter (0 = bottom, 1 = top) a calorie value sits. Each label sits in the middle of
// its box, so the scale runs through the box centres; below the lowest label it shrinks linearly to 0
export function meterPosition(kcal: number, totalExpenditure: number): number {
    const lowest = totalExpenditure - STEP * Math.floor(NUM_SEGMENTS / 2)
    const box = 1 / NUM_SEGMENTS
    if (kcal >= lowest) return Math.min(1, box * ((kcal - lowest) / STEP + 0.5))
    return lowest > 0 ? Math.max(0, box * 0.5 * kcal / lowest) : 0
}

// The calorie meter: the day's intake fills the bar from the bottom, and the white box marks the
// goal's target (the same number the card shows), turning green once the intake is inside it
export default function CalorieTarget({
    totalExpenditure = 2000,
    curr = 0,
    goal = "Maintain"
}: targetType) {
    const target = getCalorieTarget(totalExpenditure, goal) || totalExpenditure
    const onTarget = Math.abs(curr - target) <= TARGET_BAND

    return (
        <div className={styles.calorieBarContainer}>
            {meterLabels(totalExpenditure).map((num, i) => (
                <div className={styles.segment} key={i}>
                    <p>{num}</p>
                </div>
            ))}

            <div className={styles.goalHightlight} data-testid="calorie-target-band" style={{
                "--offset": `${meterPosition(target - TARGET_BAND, totalExpenditure) * 100}%`,
                "--height": `${(meterPosition(target + TARGET_BAND, totalExpenditure) - meterPosition(target - TARGET_BAND, totalExpenditure)) * 100}%`,
                "--background": onTarget ? "rgba(0, 255, 0, 0.4)" : "rgba(var(--primary-color), 0.2)"} as CSSProperties}></div>

            {/* This is the vertical progress bar indicating the user's current daily intake */}
            <div className={styles.currProgress} style={{"--curr-scale": meterPosition(curr, totalExpenditure)} as CSSProperties}></div>
        </div>
    )
}
