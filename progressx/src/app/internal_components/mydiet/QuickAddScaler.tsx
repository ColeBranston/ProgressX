"use client";

import { useMemo, useState } from 'react'
import styles from './QuickAddScaler.module.css'
import NumberField from './NumberField'
import { MICRONUTRIENT_DEFS } from './microNutrients'
import { FoodItemFormValues } from './FoodItemForm'

// A saved catalog item, as returned by /api/diet/food-items.
export type FoodItem = {
    id: string
    name: string
    serving_size: number
    serving_unit: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    fiber_g: number
    micronutrients: Record<string, number>
}

type QuickAddScalerProps = {
    item: FoodItem
    onSubmit: (values: FoodItemFormValues, opts: { saveToCatalog: boolean }) => Promise<void> | void
    onCancel: () => void
}

function round(value: number) {
    return Math.round(value * 100) / 100
}

// Quick Add step 2: instead of dumping the catalog item's raw per-serving
// values into a form for the user to recalculate by hand, this asks how
// much of the item they actually had and scales calories/macros/micros
// proportionally from the item's stored per-serving values.
export default function QuickAddScaler({ item, onSubmit, onCancel }: QuickAddScalerProps) {
    const baseServing = item.serving_size || 1
    const [servingQty, setServingQty] = useState(baseServing)
    const [showMicros, setShowMicros] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const ratio = servingQty / baseServing

    const scaled = useMemo(() => {
        const micronutrients: Record<string, number> = {}
        for (const [name, amount] of Object.entries(item.micronutrients ?? {})) {
            micronutrients[name] = round((Number(amount) || 0) * ratio)
        }
        return {
            calories: round((item.calories || 0) * ratio),
            proteinG: round((item.protein_g || 0) * ratio),
            carbsG: round((item.carbs_g || 0) * ratio),
            fatsG: round((item.fats_g || 0) * ratio),
            fiberG: round((item.fiber_g || 0) * ratio),
            micronutrients
        }
    }, [item, ratio])

    const scaledMicroEntries = MICRONUTRIENT_DEFS.filter((def) => scaled.micronutrients[def.name])

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSubmitting(true)
        try {
            await onSubmit(
                {
                    name: item.name,
                    servingQty,
                    servingUnit: item.serving_unit,
                    calories: scaled.calories,
                    proteinG: scaled.proteinG,
                    carbsG: scaled.carbsG,
                    fatsG: scaled.fatsG,
                    fiberG: scaled.fiberG,
                    micronutrients: scaled.micronutrients
                },
                { saveToCatalog: false }
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.scrollArea}>
                <p className={styles.itemName}>{item.name}</p>
                <p className={styles.baseLine}>1 {item.serving_unit} serving = {round(item.calories)} kcal</p>

                <div className={styles.fieldRow}>
                    <label htmlFor='quickServingQty'>How much did you have? ({item.serving_unit})</label>
                    <NumberField
                        id='quickServingQty'
                        required
                        min={0}
                        step={baseServing >= 1 ? 0.5 : Math.max(round(baseServing / 4), 0.1)}
                        value={servingQty}
                        onChange={setServingQty}
                    />
                </div>

                <p className={styles.sectionHeader}>Scaled nutrition</p>
                <div className={styles.previewGrid}>
                    <div className={styles.previewItem}>
                        <span className={styles.previewLabel}>Calories</span>
                        <span className={styles.previewValue}>{scaled.calories}</span>
                    </div>
                    <div className={styles.previewItem}>
                        <span className={styles.previewLabel}>Protein (g)</span>
                        <span className={styles.previewValue}>{scaled.proteinG}</span>
                    </div>
                    <div className={styles.previewItem}>
                        <span className={styles.previewLabel}>Carbs (g)</span>
                        <span className={styles.previewValue}>{scaled.carbsG}</span>
                    </div>
                    <div className={styles.previewItem}>
                        <span className={styles.previewLabel}>Fats (g)</span>
                        <span className={styles.previewValue}>{scaled.fatsG}</span>
                    </div>
                    <div className={styles.previewItem}>
                        <span className={styles.previewLabel}>Fibre (g)</span>
                        <span className={styles.previewValue}>{scaled.fiberG}</span>
                    </div>
                </div>

                {scaledMicroEntries.length > 0 ?
                    <>
                        <button type='button' className={styles.toggleMicros} onClick={() => setShowMicros(!showMicros)}>
                            {showMicros ? 'Hide micronutrients' : 'Show scaled micronutrients'}
                        </button>
                        {showMicros ?
                            <div className={styles.previewGrid}>
                                {scaledMicroEntries.map((def) => (
                                    <div className={styles.previewItem} key={def.name}>
                                        <span className={styles.previewLabel}>{def.name} ({def.measure})</span>
                                        <span className={styles.previewValue}>{scaled.micronutrients[def.name]}</span>
                                    </div>
                                ))}
                            </div>
                            : null}
                    </>
                    : null}
            </div>

            <div className={styles.actions}>
                <button type='button' className={styles.cancelButton} onClick={onCancel}>Cancel</button>
                <button type='submit' className={styles.submitButton} disabled={submitting}>Add Item</button>
            </div>
        </form>
    )
}
