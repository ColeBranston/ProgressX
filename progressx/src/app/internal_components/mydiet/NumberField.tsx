"use client";

import { useEffect, useState } from 'react'
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
const format = (value: number) => (Number.isFinite(value) ? String(value) : '0')

export default function NumberField({ id, value, onChange, min = 0, step = 1, required, ...rest }: NumberFieldProps) {
    // What's shown in the box is kept as text, separate from the numeric value: binding the
    // input straight to a number meant "0" couldn't be cleared and typing turned it into "05".
    const [text, setText] = useState(() => format(value))

    // pick up changes made outside the box (arrow buttons, quick-add scaling, form resets)
    useEffect(() => {
        setText((current) => {
            const shown = current === '' ? 0 : Number(current)
            // keep what's being typed ("", "0.", "1.50") if it already means this value
            return shown === value ? current : format(value)
        })
    }, [value])

    function handleChange(raw: string) {
        // drop leading zeros ("05" -> "5") but keep decimals like "0.5"
        const cleaned = raw.replace(/^0+(?=\d)/, '')
        setText(cleaned)
        onChange(cleaned === '' ? 0 : Number(cleaned))
    }

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
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                // select the current value on focus so typing replaces it instead of adding to it
                onFocus={(e) => e.target.select()}
                // an emptied box goes back to showing 0
                onBlur={() => { if (text === '') setText(format(value)) }}
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
