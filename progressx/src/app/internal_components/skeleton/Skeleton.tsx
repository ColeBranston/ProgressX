import { CSSProperties, ReactNode } from "react"
import styles from "./skeleton.module.css"

type Size = number | string

// One grey placeholder block with a highlight sweeping across it. Hidden from screen readers; the
// SkeletonStatus around it says what's loading.
export function Bone({ width, height, radius, className }: Readonly<{ width?: Size, height?: Size, radius?: Size, className?: string }>) {
    const style: CSSProperties = {}
    if (width !== undefined) style.width = width
    if (height !== undefined) style.height = height
    if (radius !== undefined) style.borderRadius = radius
    return <span className={`${styles.bone} ${className ?? ""}`} style={style} aria-hidden="true" data-skeleton="" />
}

// A round placeholder, for profile pictures
export function Circle({ size, className }: Readonly<{ size: Size, className?: string }>) {
    return <Bone width={size} height={size} radius="50%" className={`${styles.circle} ${className ?? ""}`} />
}

// Wraps a page-shaped skeleton: announces "Loading …" once to screen readers and marks the area busy
export function SkeletonStatus({ label, className, children }: Readonly<{ label: string, className?: string, children: ReactNode }>) {
    return (
        <div className={className} role="status" aria-busy="true" aria-label={label}>
            <span className={styles.visuallyHidden}>{label}…</span>
            {children}
        </div>
    )
}
