import type { KeyboardEvent, MouseEvent } from "react"

// Props that make a clickable element that isn't a <button> (a nav item, a card) work like one for
// keyboard and screen-reader users too: focusable with Tab, announced as a button, and pressed with
// Enter or Space.
export function pressable(onPress: () => void) {
    return {
        role: "button",
        tabIndex: 0,
        onClick: onPress,
        onKeyDown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onPress()
            }
        },
    } as const
}

// The dimmed backdrop behind a dialog: a click on the backdrop itself (not inside the dialog) closes it.
// It's a mouse shortcut only; every dialog also closes with its close button and the Escape key.
export function backdrop(onClose: () => void) {
    return {
        role: "presentation",
        onClick: (e: MouseEvent) => {
            if (e.target === e.currentTarget) onClose()
        },
    } as const
}
