import styles from "./resultsskeleton.module.css"

// Grey placeholders shaped like the results header and study cards, shown while a search loads
export default function ResultsSkeleton({ cards = 4 }: Readonly<{ cards?: number }>) {
    return (
        <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Loading results">
            <span className={styles.visuallyHidden}>Loading results…</span>
            <div className={styles.header} aria-hidden="true">
                <div className={`${styles.bone} ${styles.query}`} />
                <div className={`${styles.bone} ${styles.count}`} />
            </div>
            <div className={styles.cards} aria-hidden="true">
                {Array.from({ length: cards }, (_, i) => (
                    <div key={i} className={styles.card} data-testid="study-card-skeleton">
                        <div className={styles.journal}><div className={`${styles.bone} ${styles.journalLine}`} /></div>
                        <div className={styles.body}>
                            {[92, 100, 84, 96, 70].map((width, line) => <div key={line} className={`${styles.bone} ${styles.textLine}`} style={{ width: `${width}%` }} />)}
                        </div>
                        <div className={styles.title}>
                            <div className={`${styles.bone} ${styles.titleLine}`} />
                            <div className={`${styles.bone} ${styles.titleLine}`} style={{ width: "60%" }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
