"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./workouts.module.css";
import ExerciseAnimation from "./ExerciseAnimation";
import { FALLBACK_MOTION, MOTIONS } from "./exerciseMotions";
import type { Muscle } from "./exercises";
import type { Exercise3DScene } from "./exercise3dScene";

type Exercise3DProps = {
    motion: string,
    primary: Muscle[],
    secondary: Muscle[],
    label: string,
}

// The exercise in 3D (three.js is only downloaded when this opens). Falls back to the 2D figure when the
// device has no WebGL or the scene fails to start. Only one of these is ever on screen at a time.
export default function Exercise3D({ motion: motionId, primary, secondary, label }: Exercise3DProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading")
    const [hint, setHint] = useState(true)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const probe = document.createElement("canvas")
        if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) {
            setStatus("failed")
            return
        }
        let scene: Exercise3DScene | null = null
        let cancelled = false
        setStatus("loading")
        setHint(true)
        import("./exercise3dScene")
            .then(({ createExercise3D }) => {
                if (cancelled) return
                scene = createExercise3D(container, {
                    motion: MOTIONS[motionId] ?? FALLBACK_MOTION,
                    motionId,
                    primary,
                    secondary,
                    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
                    onInteract: () => setHint(false),
                })
                setStatus("ready")
            })
            .catch((err) => {
                console.error("Couldn't start the 3D view: ", err)
                if (!cancelled) setStatus("failed")
            })
        return () => {
            cancelled = true
            scene?.dispose()
        }
    }, [motionId, primary, secondary])

    if (status === "failed") {
        return <ExerciseAnimation motion={motionId} label={label} />
    }

    return (
        <div className={styles.viewer3d} role="img" aria-label={`${label} (3D, drag to rotate)`}>
            <div ref={containerRef} className={styles.viewer3dCanvas} />
            {status === "loading" ? <span className={styles.viewer3dLoading} aria-hidden="true" /> : null}
            {status === "ready" ?
                <div className={styles.viewer3dLegend} aria-hidden="true">
                    <span><i className={styles.legendPrimary} />Primary</span>
                    <span><i className={styles.legendSecondary} />Secondary</span>
                    {hint ? <span className={styles.viewer3dHint}>Drag to rotate</span> : null}
                </div>
            : null}
        </div>
    )
}
