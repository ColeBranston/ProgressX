import { ReactNode } from "react";
import styles from "./MuscleMap.module.css";
import { Muscle } from "./exercises";

type MuscleMapProps = {
    primary: Muscle[],
    secondary: Muscle[],
    showLegend?: boolean,
    className?: string,
}

// Left half of the body; the right half is the same shapes mirrored around x = 50
function Silhouette() {
    const half = (
        <>
            <ellipse cx="27" cy="53" rx="6.2" ry="15" />
            <ellipse cx="22.5" cy="79" rx="5.2" ry="13" />
            <circle cx="20.5" cy="95" r="4" />
            <ellipse cx="41.5" cy="122" rx="9" ry="24" />
            <ellipse cx="40.5" cy="158" rx="6.5" ry="18" />
            <ellipse cx="40" cy="178.5" rx="5" ry="3" />
        </>
    )
    return (
        <g className={styles.base}>
            <ellipse cx="50" cy="15" rx="8.5" ry="10.5" />
            <rect x="45" y="23" width="10" height="9" rx="2" />
            <path d="M31 34 C36 29 44 28 50 28 C56 28 64 29 69 34 L68 52 C66 62 63 74 63 88 L65 104 L35 104 L37 88 C37 74 34 62 32 52 Z" />
            {half}
            <g transform="translate(100 0) scale(-1 1)">{half}</g>
        </g>
    )
}

type Shape = { muscle: Muscle, node: ReactNode, mirror?: boolean }

const FRONT: Shape[] = [
    { muscle: "traps", mirror: true, node: <path d="M45 29 L36 34 L46 33.5 Z" /> },
    { muscle: "front-delts", mirror: true, node: <ellipse cx="32.5" cy="40" rx="5.6" ry="7" /> },
    { muscle: "side-delts", mirror: true, node: <ellipse cx="27.6" cy="42.5" rx="3" ry="6.5" /> },
    { muscle: "chest", mirror: true, node: <path d="M49 36 C42 34.5 36 37.5 35 44.5 C35 51.5 41 55 49 54 Z" /> },
    { muscle: "biceps", mirror: true, node: <ellipse cx="27" cy="57" rx="4.3" ry="9" /> },
    { muscle: "forearms", mirror: true, node: <ellipse cx="22.5" cy="78" rx="3.8" ry="10.5" transform="rotate(8 22.5 78)" /> },
    { muscle: "abs", node: <rect x="44" y="57" width="12" height="31" rx="3" /> },
    { muscle: "obliques", mirror: true, node: <path d="M42.5 60 L37.2 57.5 C36.2 69 37 79 39.6 88.5 L42.5 88.5 Z" /> },
    { muscle: "quads", mirror: true, node: <ellipse cx="41.5" cy="121" rx="7.4" ry="20" /> },
    { muscle: "calves", mirror: true, node: <ellipse cx="38.6" cy="156" rx="3.4" ry="11" /> },
]

const BACK: Shape[] = [
    { muscle: "traps", node: <path d="M50 26 L37 35 L44 42 L50 62 L56 42 L63 35 Z" /> },
    { muscle: "rear-delts", mirror: true, node: <ellipse cx="32" cy="41" rx="5.4" ry="6.5" /> },
    { muscle: "side-delts", mirror: true, node: <ellipse cx="27.6" cy="42.5" rx="3" ry="6.5" /> },
    { muscle: "upper-back", mirror: true, node: <ellipse cx="42.5" cy="48" rx="4.4" ry="6" /> },
    { muscle: "lats", mirror: true, node: <path d="M36.5 46 C34.5 58 38 71 46 80 L48.6 70 L44 55 Z" /> },
    { muscle: "triceps", mirror: true, node: <ellipse cx="27" cy="56" rx="4.3" ry="9.5" /> },
    { muscle: "forearms", mirror: true, node: <ellipse cx="22.5" cy="78" rx="3.8" ry="10.5" transform="rotate(8 22.5 78)" /> },
    { muscle: "lower-back", mirror: true, node: <rect x="44.6" y="67" width="4.6" height="21" rx="2.3" /> },
    { muscle: "glutes", mirror: true, node: <ellipse cx="42.8" cy="99" rx="8" ry="9" /> },
    { muscle: "hamstrings", mirror: true, node: <ellipse cx="41.5" cy="126" rx="6.8" ry="17.5" /> },
    { muscle: "calves", mirror: true, node: <ellipse cx="40.5" cy="156" rx="5.4" ry="12" /> },
]

function Figure({ shapes, primary, secondary, title }: { shapes: Shape[], primary: Set<Muscle>, secondary: Set<Muscle>, title: string }) {
    const cls = (muscle: Muscle) => primary.has(muscle) ? styles.primary : secondary.has(muscle) ? styles.secondary : styles.idle
    return (
        <figure className={styles.figure}>
            <svg viewBox="0 0 100 186" aria-hidden="true">
                <Silhouette />
                {shapes.map((shape, i) => (
                    <g key={i} className={cls(shape.muscle)}>
                        {shape.node}
                        {shape.mirror ? <g transform="translate(100 0) scale(-1 1)">{shape.node}</g> : null}
                    </g>
                ))}
            </svg>
            <figcaption>{title}</figcaption>
        </figure>
    )
}

// Front and back body with the worked muscles highlighted: solid red = primary, faded red = secondary
export default function MuscleMap({ primary, secondary, showLegend = true, className }: MuscleMapProps) {
    const primarySet = new Set(primary)
    const secondarySet = new Set(secondary.filter((muscle) => !primarySet.has(muscle)))

    return (
        <div className={`${styles.map} ${className ?? ""}`}>
            <div className={styles.figures}>
                <Figure shapes={FRONT} primary={primarySet} secondary={secondarySet} title="Front" />
                <Figure shapes={BACK} primary={primarySet} secondary={secondarySet} title="Back" />
            </div>
            {showLegend ?
                <div className={styles.legend}>
                    <span><i className={styles.swatchPrimary} />Primary</span>
                    <span><i className={styles.swatchSecondary} />Secondary</span>
                </div>
            : null}
        </div>
    )
}
