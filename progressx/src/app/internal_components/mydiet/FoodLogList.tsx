"use client";

import styles from './FoodLogList.module.css'

export type FoodLogEntry = {
    id: string
    user_id: string
    food_item_id: string | null
    log_date: string
    name: string
    serving_qty: number
    serving_unit: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    fiber_g: number
    micronutrients: Record<string, number>
    created_at: string
    updated_at: string
}

type FoodLogListProps = {
    entries: FoodLogEntry[]
    onSelect: (entry: FoodLogEntry) => void
}

// Renders the day's logged food items; clicking one opens it for editing
// (mydiet/page.tsx wires onSelect to the FoodItemForm edit flow).
export default function FoodLogList({ entries, onSelect }: FoodLogListProps) {
    if (entries.length === 0) {
        return <p className={styles.emptyState}>No food logged yet for this day.</p>
    }

    return (
        <ul className={styles.list}>
            {entries.map((entry) => (
                <li key={entry.id} className={styles.item} onClick={() => onSelect(entry)}>
                    <div className={styles.itemMain}>
                        <p className={styles.itemName}>{entry.name}</p>
                        <p className={styles.itemServing}>{entry.serving_qty} {entry.serving_unit}</p>
                    </div>
                    <p className={styles.itemCalories}>{Math.round(entry.calories)} kCal</p>
                </li>
            ))}
        </ul>
    )
}
