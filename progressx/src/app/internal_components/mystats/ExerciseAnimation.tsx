"use client";

import { useEffect, useMemo, useRef } from "react";
import styles from "./ExerciseAnimation.module.css";
import { FALLBACK_MOTION, FLOOR_Y, MOTIONS, Primitive, frameAt } from "./exerciseMotions";

type ExerciseAnimationProps = {
    motion: string,
    label: string, // empty = decorative (hidden from screen readers)
    className?: string,
    playing?: boolean, // false = hold still
    stillAt?: number,  // where in the rep (0..1) the still frame is taken
}

const DEFAULT_PERIOD_MS = 2600

// server and browser trig can differ in the last digit; rounding keeps hydration consistent
const round = (n: number) => Math.round(n * 100) / 100

// Loops one rep (start -> end -> start) of an exercise as a stick figure. Frames are written straight
// to the SVG attributes (no React re-render per frame), only while the figure is on screen, and it
// holds a still pose for people who prefer reduced motion.
export default function ExerciseAnimation({ motion: motionId, label, className, playing = true, stillAt = 0.5 }: ExerciseAnimationProps) {
    const motion = MOTIONS[motionId] ?? FALLBACK_MOTION
    const svgRef = useRef<SVGSVGElement>(null)
    const shapeRefs = useRef<(SVGLineElement | SVGCircleElement | null)[]>([])

    // first paint (and the still frame): halfway through the rep by default, so it still shows the movement
    const initial = useMemo(() => frameAt(motion, stillAt), [motion, stillAt])

    useEffect(() => {
        const svg = svgRef.current
        if (!svg || !playing) return

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (reduceMotion) return

        const period = motion.period ?? DEFAULT_PERIOD_MS
        let frame = 0
        let visible = false
        const start = performance.now() - period * Math.acos(1 - 2 * stillAt) / (2 * Math.PI) // continue from the first-paint frame

        const draw = (prims: Primitive[]) => {
            prims.forEach((prim, i) => {
                const el = shapeRefs.current[i]
                if (!el) return
                if (prim.kind === "line") {
                    el.setAttribute("x1", prim.x1.toFixed(2))
                    el.setAttribute("y1", prim.y1.toFixed(2))
                    el.setAttribute("x2", prim.x2.toFixed(2))
                    el.setAttribute("y2", prim.y2.toFixed(2))
                } else {
                    el.setAttribute("cx", prim.cx.toFixed(2))
                    el.setAttribute("cy", prim.cy.toFixed(2))
                }
            })
        }

        const tick = (now: number) => {
            const phase = ((now - start) % period) / period
            draw(frameAt(motion, (1 - Math.cos(phase * 2 * Math.PI)) / 2)) // ease a -> b -> a
            frame = requestAnimationFrame(tick)
        }

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !visible) {
                visible = true
                frame = requestAnimationFrame(tick)
            } else if (!entry.isIntersecting && visible) {
                visible = false
                cancelAnimationFrame(frame)
            }
        })
        observer.observe(svg)

        return () => {
            observer.disconnect()
            cancelAnimationFrame(frame)
        }
    }, [motion, playing, stillAt])

    return (
        <svg ref={svgRef} viewBox="0 0 120 100" className={`${styles.figure} ${className ?? ""}`} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
            {motion.floor !== false ? <line className={styles.floor} x1={4} y1={FLOOR_Y} x2={116} y2={FLOOR_Y} /> : null}
            {motion.scenery?.map((d) => <path key={d} d={d} className={styles.scenery} />)}
            {initial.map((prim, i) => {
                const className = prim.cls.split(" ").map((cls) => styles[cls]).join(" ")
                return prim.kind === "line"
                    ? <line key={i} ref={(el) => { shapeRefs.current[i] = el }} className={className} x1={round(prim.x1)} y1={round(prim.y1)} x2={round(prim.x2)} y2={round(prim.y2)} />
                    : <circle key={i} ref={(el) => { shapeRefs.current[i] = el }} className={className} cx={round(prim.cx)} cy={round(prim.cy)} r={prim.r} />
            })}
        </svg>
    )
}
