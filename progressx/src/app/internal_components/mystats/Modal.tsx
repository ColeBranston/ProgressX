"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import styles from "./workouts.module.css";
import { backdrop } from "../a11y";

type ModalProps = {
    title: string,
    onClose: () => void,
    children: ReactNode,
    wide?: boolean,
}

// Centered dialog (a bottom sheet on phones). Escape or a click on the backdrop closes it, and
// focus moves into it when it opens and back to where it was when it closes.
export default function Modal({ title, onClose, children, wide }: ModalProps) {
    const titleId = useId()
    const dialogRef = useRef<HTMLDivElement>(null)
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose
    // whatever opened the modal (read while rendering, before an autofocused field inside takes focus)
    const [ opener ] = useState(() => (typeof document === "undefined" ? null : document.activeElement as HTMLElement | null))

    useEffect(() => {
        // keep focus on an autofocused field inside (e.g. the picker's search), otherwise focus the dialog
        if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus()

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCloseRef.current()
        }
        window.addEventListener("keydown", onKey)

        return () => {
            window.removeEventListener("keydown", onKey)
            opener?.focus?.()
        }
    }, [opener])

    return (
        <div className={styles.backdrop} {...backdrop(onClose)}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`${styles.dialog} ${wide ? styles.dialogWide : ""}`}
            >
                <header className={styles.dialogHeader}>
                    <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
                    <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">✕</button>
                </header>
                <div className={styles.dialogBody}>{children}</div>
            </div>
        </div>
    )
}
