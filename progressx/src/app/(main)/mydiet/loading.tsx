import styles from "./dietpage.module.css";
import DietSkeleton from "./DietSkeleton";

// The diet page's own skeleton, shown the moment the tab is clicked
export default function Loading() {
    return (
        <div className={`mainWrapper ${styles.dietWrapper}`}>
            <DietSkeleton />
        </div>
    )
}
