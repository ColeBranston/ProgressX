import styles from "./dietpage.module.css";
import { Bone, Circle, SkeletonStatus } from "../../internal_components/skeleton/Skeleton";

// The diet page while the day's food, water and goals load: the same header, summary strip and cards,
// in their real grid, so nothing jumps when the data arrives
export default function DietSkeleton() {
    return (
        <SkeletonStatus label="Loading your diet" className={styles.mainContainer}>
            <header className={styles.pageHeader}>
                <div className={styles.pageTitleGroup}>
                    <Bone width={180} height={44} />
                    <Bone width={240} height={14} />
                </div>
                <div className={styles.skeletonDays}>
                    <Circle size={40} />
                    {Array.from({ length: 7 }, (_, i) => <Bone key={i} width={44} height={60} radius={14} />)}
                </div>
            </header>

            <section className={styles.statStrip}>
                <div className={`${styles.scoreSlot} ${styles.card}`}>
                    <Bone width={120} height={20} />
                    <div className={styles.skeletonRow}>
                        <Circle size={96} />
                        <div className={styles.skeletonStack}>
                            {["80%", "65%", "72%"].map((width) => <Bone key={width} width={width} height={12} />)}
                        </div>
                    </div>
                </div>
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={styles.statCard}>
                        <Bone width="45%" height={12} />
                        <Bone width="60%" height={26} />
                        <Bone width="75%" height={11} />
                        <Bone width="100%" height={6} radius={99} />
                    </div>
                ))}
            </section>

            <div className={styles.dashboardGrid}>
                <section className={`${styles.card} ${styles.foodCard}`}>
                    <Bone width={130} height={24} />
                    {Array.from({ length: 5 }, (_, i) => <Bone key={i} width="100%" height={44} radius={12} />)}
                </section>
                <section className={`${styles.card} ${styles.calorieCard}`}>
                    <Bone width={170} height={24} />
                    <div className={styles.skeletonCentre}><Circle size={190} /></div>
                </section>
                <section className={`${styles.card} ${styles.waterCard}`}>
                    <Bone width={90} height={24} />
                    <Bone width="100%" height={150} radius={16} />
                    <Bone width="100%" height={40} radius={12} />
                </section>
                <section className={`${styles.card} ${styles.weightCard}`}>
                    <Bone width={110} height={24} />
                    <Bone width="100%" height={56} radius={12} />
                </section>
                <section className={`${styles.card} ${styles.nutritionCard}`}>
                    <Bone width={90} height={24} />
                    {["100%", "100%", "100%", "100%"].map((width, i) => <Bone key={i} width={width} height={14} radius={99} />)}
                </section>
            </div>
        </SkeletonStatus>
    )
}
