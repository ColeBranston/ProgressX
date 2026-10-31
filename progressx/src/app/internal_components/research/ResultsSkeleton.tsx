import styles from "./resultsskeleton.module.css"
import { Bone, SkeletonStatus } from "../skeleton/Skeleton"

// Grey placeholders shaped like the results header and study cards, shown while a search loads
export default function ResultsSkeleton({ cards = 4 }: Readonly<{ cards?: number }>) {
    return (
        <SkeletonStatus label="Loading results" className={styles.skeleton}>
            <div className={styles.header}>
                <Bone width={140} height={28} />
                <Bone width={200} height={20} />
            </div>
            <div className={styles.cards}>
                {Array.from({ length: cards }, (_, i) => (
                    <div key={i} className={styles.card} data-testid="study-card-skeleton">
                        <div className={styles.journal}><Bone width="55%" /></div>
                        <div className={styles.body}>
                            {["92%", "100%", "84%", "96%", "70%"].map((width) => <Bone key={width} width={width} height={12} />)}
                        </div>
                        <div className={styles.title}>
                            <Bone width="90%" height={16} />
                            <Bone width="60%" height={16} />
                        </div>
                    </div>
                ))}
            </div>
        </SkeletonStatus>
    )
}
