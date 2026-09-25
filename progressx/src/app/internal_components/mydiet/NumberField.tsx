"use client";

import styles from './NumberField.module.css'

type NumberFieldProps = {
    id: string
    value: number
    onChange: (value: number) => void
    min?: number
    step?: number
    required?: boolean
    'aria-label'?: string
}

// A number input with the browser's native spinner arrows hidden and a
// themed pair of up/down buttons in their place. Used everywhere a numeric
// value is entered in the diet forms (serving qty, calories, macros, and
// every micronutrient) so they all share one custom control instead of each
// browser's default look.
export default function NumberField({ id, value, onChange, min = 0, step = 1, required, ...rest }: NumberFieldProps) {
    function adjust(delta: number) {
        const next = Math.round((value + delta) * 100) / 100
        onChange(min !== undefined ? Math.max(min, next) : next)
    }

    return (
        <div className={styles.wrapper}>
            <input
                id={id}
                type="number"
                min={min}
                // Always "any" at the HTML level - the browser's native step
                // validation otherwise rejects any typed value that isn't a
                // multiple of `step` (e.g. typing "0.5" with step=1 blocks
                // submission). The numeric `step` prop is only used below,
                // purely for the custom arrow buttons' increment math.
                step="any"
                required={required}
                value={Number.isFinite(value) ? value : 0}
                onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                {...rest}
            />
            <div className={styles.spinner}>
                <button type="button" tabIndex={-1} aria-label="Increase value" onClick={() => adjust(step)}>
                    <svg viewBox="0 0 10 6" width="10" height="6" fill="none">
                        <path d="M1 5L5 1L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button type="button" tabIndex={-1} aria-label="Decrease value" onClick={() => adjust(-step)}>
                    <svg viewBox="0 0 10 6" width="10" height="6" fill="none">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
