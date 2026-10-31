import styles from "./mystats.module.css";
import chartStyles from "../../internal_components/mystats/charts.module.css";
import { Bone, SkeletonStatus } from "../../internal_components/skeleton/Skeleton";

type Chart = "wide" | "half"

// A My Stats tab while its data loads: the controls row, the stat tiles and the chart cards, in the
// same containers as the real page so nothing jumps when it arrives
export default function StatsSkeleton({ label, controls = "range", tiles = 0, charts }: Readonly<{
    label: string,
    controls?: "range" | "tabs",
    tiles?: number,
    charts: Chart[],
}>) {
    return (
        <SkeletonStatus label={label} className={styles.skeleton}>
            <div className={styles.filterRow}>
                {controls === "range"
                    ? <><Bone width={48} height={12} /><Bone width={250} height={38} radius={12} /></>
                    : <><Bone width={320} height={38} radius={12} /><Bone width={90} height={38} radius={12} /></>}
            </div>

            {tiles > 0 ?
                <div className={styles.tiles}>
                    {Array.from({ length: tiles }, (_, i) => (
                        <div key={i} className={chartStyles.tile}>
                            <Bone width="55%" height={12} />
                            <Bone width="70%" height={26} />
                            <Bone width="45%" height={11} />
                        </div>
                    ))}
                </div>
            : null}

            <div className={styles.grid2}>
                {charts.map((chart, i) => (
                    <section key={i} className={`${chartStyles.card} ${chart === "wide" ? styles.span2 : ""}`} data-testid="chart-skeleton">
                        <div className={chartStyles.cardHeader}>
                            <div className={styles.skeletonStack}>
                                <Bone width={160} height={18} />
                                <Bone width={240} height={12} />
                            </div>
                            <Bone width={110} height={30} radius={10} />
                        </div>
                        <Bone width="100%" height={chart === "wide" ? 200 : 180} radius={12} />
                    </section>
                ))}
            </div>
        </SkeletonStatus>
    )
}
