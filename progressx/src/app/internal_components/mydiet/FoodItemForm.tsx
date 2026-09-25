"use client";

import { useState } from 'react'
import styles from './FoodItemForm.module.css'
import { MICRONUTRIENT_DEFS } from './microNutrients'
import NumberField from './NumberField'

export type FoodItemFormValues = {
    name: string
    servingQty: number
    servingUnit: string
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
    fiberG: number
    micronutrients: Record<string, number>
}

const EMPTY_VALUES: FoodItemFormValues = {
    name: '',
    servingQty: 1,
    servingUnit: 'serving',
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatsG: 0,
    fiberG: 0,
    micronutrients: {}
}

type FoodItemFormProps = {
    mode: 'create' | 'edit'
    initialValues?: Partial<FoodItemFormValues>
    onSubmit: (values: FoodItemFormValues, opts: { saveToCatalog: boolean }) => Promise<void> | void
    onCancel: () => void
    onDelete?: () => void
}

// Full macro + micronutrient entry form, used both for manually adding a food
// item to the day's log and for editing an already-logged item. "Quick add"
// also renders this form, pre-filled from a saved catalog item, so the user
// can tweak amounts before submitting.
export default function FoodItemForm({ mode, initialValues, onSubmit, onCancel, onDelete }: FoodItemFormProps) {
    const [values, setValues] = useState<FoodItemFormValues>({
        ...EMPTY_VALUES,
        ...initialValues,
        micronutrients: { ...EMPTY_VALUES.micronutrients, ...initialValues?.micronutrients }
    })
    const [saveToCatalog, setSaveToCatalog] = useState(false)
    const [showMicros, setShowMicros] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    function setField<K extends keyof FoodItemFormValues>(key: K, value: FoodItemFormValues[K]) {
        setValues((prev) => ({ ...prev, [key]: value }))
    }

    function setMicronutrient(name: string, value: number) {
        setValues((prev) => ({ ...prev, micronutrients: { ...prev.micronutrients, [name]: value } }))
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSubmitting(true)
        try {
            await onSubmit(values, { saveToCatalog })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.scrollArea}>
                <div className={styles.fieldRow}>
                    <label htmlFor='foodName'>Name</label>
                    <input required id='foodName' type='text' value={values.name} onChange={(e) => setField('name', e.target.value)} />
                </div>

                <div className={styles.fieldRow}>
                    <label htmlFor='servingQty'>Serving Size</label>
                    <div className={styles.servingInputs}>
                        <NumberField id='servingQty' required min={0} step={0.5} value={values.servingQty} onChange={(v) => setField('servingQty', v)} />
                        <input aria-label='Serving unit' type='text' placeholder='e.g. cup, g, slice' value={values.servingUnit} onChange={(e) => setField('servingUnit', e.target.value)} />
                    </div>
                    <p className={styles.helperText}>How much you're logging (e.g. &quot;1 cup&quot; or &quot;150 g&quot;). The macros and micros below should be the totals for that amount, not per 100g.</p>
                </div>

                <p className={styles.sectionHeader}>Macros</p>
                <div className={styles.macroGrid}>
                    <div className={styles.fieldRow}>
                        <label htmlFor='calories'>Calories</label>
                        <NumberField id='calories' min={0} step={1} value={values.calories} onChange={(v) => setField('calories', v)} />
                    </div>
                    <div className={styles.fieldRow}>
                        <label htmlFor='protein'>Protein (g)</label>
                        <NumberField id='protein' min={0} step={0.1} value={values.proteinG} onChange={(v) => setField('proteinG', v)} />
                    </div>
                    <div className={styles.fieldRow}>
                        <label htmlFor='carbs'>Carbs (g)</label>
                        <NumberField id='carbs' min={0} step={0.1} value={values.carbsG} onChange={(v) => setField('carbsG', v)} />
                    </div>
                    <div className={styles.fieldRow}>
                        <label htmlFor='fats'>Fats (g)</label>
                        <NumberField id='fats' min={0} step={0.1} value={values.fatsG} onChange={(v) => setField('fatsG', v)} />
                    </div>
                    <div className={styles.fieldRow}>
                        <label htmlFor='fiber'>Fibre (g)</label>
                        <NumberField id='fiber' min={0} step={0.1} value={values.fiberG} onChange={(v) => setField('fiberG', v)} />
                    </div>
                </div>

                <button type='button' className={styles.toggleMicros} onClick={() => setShowMicros(!showMicros)}>
                    {showMicros ? 'Hide micronutrients' : 'Add micronutrients'}
                </button>

                {showMicros ?
                    <div className={styles.microGrid}>
                        {MICRONUTRIENT_DEFS.map((def) => (
                            <div className={styles.fieldRow} key={def.name}>
                                <label htmlFor={`micro-${def.name}`}>{def.name} ({def.measure})</label>
                                <NumberField
                                    id={`micro-${def.name}`}
                                    min={0}
                                    step={0.1}
                                    value={values.micronutrients[def.name] ?? 0}
                                    onChange={(v) => setMicronutrient(def.name, v)}
                                />
                            </div>
                        ))}
                    </div>
                    : null}

                {mode === 'create' ?
                    <label className={styles.checkboxRow}>
                        <input type='checkbox' checked={saveToCatalog} onChange={(e) => setSaveToCatalog(e.target.checked)} />
                        Save to my food catalog for quick re-add
                    </label>
                    : null}
            </div>

            <div className={styles.actions}>
                {mode === 'edit' && onDelete ?
                    <button type='button' className={styles.deleteButton} onClick={onDelete}>Delete</button>
                    : null}
                <button type='button' className={styles.cancelButton} onClick={onCancel}>Cancel</button>
                <button type='submit' className={styles.submitButton} disabled={submitting}>
                    {mode === 'edit' ? 'Save Changes' : 'Add Item'}
                </button>
            </div>
        </form>
    )
}
