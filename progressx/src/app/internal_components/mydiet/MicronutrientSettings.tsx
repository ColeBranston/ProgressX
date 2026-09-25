"use client";

import { useState } from 'react'
import styles from './MicronutrientSettings.module.css'
import { MICRONUTRIENT_DEFS } from './microNutrients'

type MicronutrientSettingsProps = {
    selected: string[]
    onSave: (selected: string[]) => Promise<void> | void
    onClose: () => void
}

// Lets the user choose which of the 21 tracked micronutrients show up in the
// diet page's Micros list. Persisted server-side via /api/diet/preferences
// (diet_config.displayed_micronutrients).
export default function MicronutrientSettings({ selected, onSave, onClose }: MicronutrientSettingsProps) {
    const [chosen, setChosen] = useState<Set<string>>(new Set(selected))
    const [saving, setSaving] = useState(false)

    function toggle(name: string) {
        setChosen((prev) => {
            const next = new Set(prev)
            if (next.has(name)) {
                next.delete(name)
            } else {
                next.add(name)
            }
            return next
        })
    }

    async function handleSave() {
        setSaving(true)
        try {
            await onSave(Array.from(chosen))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={styles.panel}>
            <p className={styles.header}>Choose Displayed Micronutrients</p>
            <div className={styles.list}>
                {MICRONUTRIENT_DEFS.map((def) => (
                    <label key={def.name} className={styles.row}>
                        <input type='checkbox' checked={chosen.has(def.name)} onChange={() => toggle(def.name)} />
                        {def.name}
                    </label>
                ))}
            </div>
            <div className={styles.actions}>
                <button type='button' className={styles.cancelButton} onClick={onClose}>Cancel</button>
                <button type='button' className={styles.saveButton} disabled={saving} onClick={handleSave}>Save</button>
            </div>
        </div>
    )
}
