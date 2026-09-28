"use client";

import styles from './FoodLogList.module.css'

export type FoodLogEntry = {
    id: string
    user_id: string
    food_item_id: string | null
    // the quick-add catalog item this food matches (by link or by name), or null - set by the API
    catalog_item_id?: string | null
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
    onToggleCatalog?: (entry: FoodLogEntry) => void
    savingIds?: Set<string>
}

// Renders the day's logged food items; clicking one opens it for editing
// (mydiet/page.tsx wires onSelect to the FoodItemForm edit flow). The bookmark
// toggles the item in the quick-add catalog; it's filled while the item is in there.
export default function FoodLogList({ entries, onSelect, onToggleCatalog, savingIds }: FoodLogListProps) {
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
                    <div className={styles.itemSide}>
                        <p className={styles.itemCalories}>{Math.round(entry.calories)} kCal</p>
                        {onToggleCatalog ?
                            <button
                                type="button"
                                className={`${styles.catalogButton} ${entry.catalog_item_id ? styles.catalogSaved : ""}`}
                                title={entry.catalog_item_id ? "Remove from Quick Add" : "Save to Quick Add"}
                                aria-label={entry.catalog_item_id ? `Remove ${entry.name} from Quick Add` : `Save ${entry.name} to Quick Add`}
                                aria-pressed={Boolean(entry.catalog_item_id)}
                                disabled={savingIds?.has(entry.id)}
                                onClick={(e) => { e.stopPropagation(); onToggleCatalog(entry) }}
                            >
                                {entry.catalog_item_id ?
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5H18V21L12 16.8L6 21V3.5Z" strokeLinejoin="round"/></svg>
                                :
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5H18V21L12 16.8L6 21V3.5Z" strokeLinejoin="round"/><path d="M12 7.5V12.5M9.5 10H14.5" strokeLinecap="round"/></svg>
                                }
                            </button>
                        : null}
                    </div>
                </li>
            ))}
        </ul>
    )
}
