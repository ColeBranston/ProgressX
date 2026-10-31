import styles from "./loading.module.css";
import { Bone, SkeletonStatus } from "../internal_components/skeleton/Skeleton";

// Shown the moment a tab is clicked, while its page comes from the server. Tabs with a skeleton of their
// own (My Diet, My Stats, Profile) have their own loading.tsx; this covers the rest
export default function Loading() {
    return (
        <div className="mainWrapper">
            <SkeletonStatus label="Loading" className={styles.page}>
                <Bone width={220} height={36} />
                <Bone width={320} height={14} />
                <div className={styles.block}>
                    <Bone width="100%" height={240} radius={16} />
                    {["92%", "80%", "86%"].map((width) => <Bone key={width} width={width} height={14} />)}
                </div>
            </SkeletonStatus>
        </div>
    )
}
