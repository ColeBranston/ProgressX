import styles from "./mystats.module.css";
import StatsNav from "./StatsNav";

// Shared by the Diet (/mystats), Workouts (/mystats/workouts) and Weight (/mystats/weight) tabs, so switching tabs keeps the header
export default function MyStatsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className={`mainWrapper ${styles.statsWrapper}`}>
            <div className={styles.page}>
                <div className={styles.content}>
                    <header className={styles.header}>
                        <div>
                            <h1 className={styles.title}>My Stats</h1>
                            <p className={styles.subtitle}>Your trends, week over week</p>
                        </div>
                        <StatsNav />
                    </header>
                    {children}
                </div>
            </div>
        </div>
    )
}
