"use client";

import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react'
import styles from './WaterTracker.module.css'

export type WaterLogEntry = {
    id: string
    user_id: string
    log_date: string
    amount_ml: number
    created_at: string
}

type WaterTrackerProps = {
    entries: WaterLogEntry[]
    targetMl: number
    onAdd: (amountMl: number) => void
    onUndo: (entry: WaterLogEntry) => void
}

// Droplet geometry, in the SVG's viewBox units
const DROP_PATH = "M100 6 C100 6 26 92 26 158 C26 202 59 236 100 236 C141 236 174 202 174 158 C174 92 100 6 100 6 Z"
const DROP_BOTTOM = 236
const DROP_TOP = 6
const DROP_HEIGHT = DROP_BOTTOM - DROP_TOP
const FALL_START_Y = 34

// How long a falling drop takes to reach the water; the level rises when it lands
const FALL_MS = 550

const QUICK_ADD_AMOUNTS = [
    { label: "Glass", amountMl: 250 },
    { label: "Bottle", amountMl: 500 },
    { label: "Large", amountMl: 1000 },
]
const TICKS = [0.25, 0.5, 0.75, 1]

export function formatVolume(ml: number) {
    return ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, "")} L` : `${Math.round(ml)} ml`
}

// y coordinate of the water surface for a given fill fraction (0 = empty, 1 = full)
function surfaceY(fraction: number) {
    return DROP_BOTTOM - Math.min(1, Math.max(0, fraction)) * DROP_HEIGHT
}

function prefersReducedMotion() {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

type FallingDrop = { id: number, landY: number }

export default function WaterTracker({ entries, targetMl, onAdd, onUndo }: WaterTrackerProps) {
    const consumedMl = entries.reduce((sum, entry) => sum + (Number(entry.amount_ml) || 0), 0)

    // The level shown in the droplet. It trails consumedMl while a drop is falling,
    // so the water only rises once the drop hits the surface.
    const [displayedMl, setDisplayedMl] = useState(0)
    const [drops, setDrops] = useState<FallingDrop[]>([])
    const [customAmount, setCustomAmount] = useState("")
    const pendingFall = useRef(false)
    const nextDropId = useRef(0)

    useEffect(() => {
        if (!pendingFall.current) {
            // fill on load / day change / undo, no drop
            const frame = requestAnimationFrame(() => setDisplayedMl(consumedMl))
            return () => cancelAnimationFrame(frame)
        }

        const timer = setTimeout(() => {
            pendingFall.current = false
            setDisplayedMl(consumedMl)
        }, FALL_MS)
        return () => clearTimeout(timer)
    }, [consumedMl])

    const safeTarget = targetMl > 0 ? targetMl : 1
    const fraction = consumedMl / safeTarget
    const displayedY = surfaceY(displayedMl / safeTarget)
    const goalReached = consumedMl >= safeTarget
    const lastEntry = entries[entries.length - 1]

    function pour(amountMl: number) {
        if (!prefersReducedMotion()) {
            pendingFall.current = true
            const id = nextDropId.current++
            setDrops((prev) => [...prev, { id, landY: displayedY }])
            setTimeout(() => setDrops((prev) => prev.filter((drop) => drop.id !== id)), FALL_MS + 700)
        }
        onAdd(amountMl)
    }

    function submitCustom(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const amount = Math.round(Number(customAmount))
        if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) return
        pour(amount)
        setCustomAmount("")
    }

    return (
        <div className={styles.tracker}>
            <div className={styles.header}>
                <p className={styles.title}>Water</p>
                <p className={styles.subtitle}>Goal {formatVolume(targetMl)} · based on your weight &amp; activity</p>
            </div>

            <div className={styles.meter}>
                <svg
                    className={styles.droplet}
                    viewBox="0 0 250 244"
                    role="img"
                    aria-label={`Water: ${formatVolume(consumedMl)} of ${formatVolume(targetMl)} (${Math.round(fraction * 100)}%)`}
                >
                    <defs>
                        <clipPath id="water-drop-clip">
                            <path d={DROP_PATH} />
                        </clipPath>
                        <linearGradient id="water-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5cc8ff" />
                            <stop offset="100%" stopColor="#1463c7" />
                        </linearGradient>
                    </defs>

                    <path d={DROP_PATH} className={styles.dropInside} />

                    <g clipPath="url(#water-drop-clip)">
                        <g
                            className={styles.water}
                            style={{ transform: `translateY(${displayedY}px)`, opacity: displayedMl > 0 ? 1 : 0 } as CSSProperties}
                        >
                            <path className={styles.waveBack} d="M0 0 Q25 -7 50 0 T100 0 T150 0 T200 0 T250 0 T300 0 T350 0 T400 0 V260 H0 Z" />
                            <path className={styles.waveFront} d="M0 0 Q25 7 50 0 T100 0 T150 0 T200 0 T250 0 T300 0 T350 0 T400 0 V260 H0 Z" fill="url(#water-fill)" />
                        </g>

                        {drops.map((drop) => (
                            <g key={drop.id}>
                                <path
                                    className={styles.fallingDrop}
                                    style={{ "--fall": `${Math.max(0, drop.landY - FALL_START_Y)}px`, "--fall-ms": `${FALL_MS}ms` } as CSSProperties}
                                    d={`M100 ${FALL_START_Y - 12} C100 ${FALL_START_Y - 12} 93 ${FALL_START_Y - 2} 93 ${FALL_START_Y + 2} A7 7 0 0 0 107 ${FALL_START_Y + 2} C107 ${FALL_START_Y - 2} 100 ${FALL_START_Y - 12} 100 ${FALL_START_Y - 12} Z`}
                                />
                                <ellipse
                                    className={styles.splash}
                                    style={{ "--fall-ms": `${FALL_MS}ms` } as CSSProperties}
                                    cx="100" cy={drop.landY} rx="6" ry="2"
                                />
                            </g>
                        ))}
                    </g>

                    <path d={DROP_PATH} className={`${styles.dropOutline} ${goalReached ? styles.dropOutlineDone : ""}`} />

                    {TICKS.map((tick) => {
                        const y = surfaceY(tick)
                        return (
                            <g key={tick} className={styles.tick}>
                                <line x1="184" x2="196" y1={y} y2={y} />
                                <text x="202" y={y + 4}>{tick === 1 ? formatVolume(targetMl) : `${(targetMl * tick / 1000).toFixed(1)} L`}</text>
                            </g>
                        )
                    })}
                </svg>

                <div className={styles.readout}>
                    <p key={consumedMl} className={styles.amount}>{formatVolume(consumedMl)}</p>
                    <p className={styles.percent}>
                        {goalReached ? "Goal reached" : `${Math.round(fraction * 100)}% · ${formatVolume(targetMl - consumedMl)} to go`}
                    </p>
                </div>
            </div>

            <div className={styles.quickAdd}>
                {QUICK_ADD_AMOUNTS.map(({ label, amountMl }) => (
                    <button key={amountMl} type="button" className={styles.quickAddButton} onClick={() => pour(amountMl)}>
                        <span className={styles.quickAddAmount}>+{formatVolume(amountMl)}</span>
                        <span className={styles.quickAddLabel}>{label}</span>
                    </button>
                ))}
            </div>

            <form className={styles.customRow} onSubmit={submitCustom}>
                <input
                    className={styles.customInput}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={5000}
                    placeholder="Custom amount"
                    aria-label="Custom water amount in millilitres"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                />
                <span className={styles.customUnit}>ml</span>
                <button type="submit" className={styles.customButton} disabled={!customAmount}>Add</button>
            </form>

            <div className={styles.footer}>
                <span>{entries.length} {entries.length === 1 ? "drink" : "drinks"} logged</span>
                {lastEntry ?
                    <button type="button" className={styles.undoButton} onClick={() => onUndo(lastEntry)}>
                        Undo {formatVolume(lastEntry.amount_ml)}
                    </button>
                : null}
            </div>
        </div>
    )
}
