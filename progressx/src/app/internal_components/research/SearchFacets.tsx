import { useEffect, useRef, useState } from "react"
import styles from "./searchfacets.module.css"
import { FACET_FIELDS, FACET_LABEL, FacetField, Facets, Filters, facetOptions, hasFilters } from "./researchFilters"

// Above this many journals, their menu gets a box to narrow the list
const JOURNAL_FIND_THRESHOLD = 8

// Year and journal filters for a research search: a compact button for each that opens a scrollable
// checkbox menu, so they sit beside the search box without pushing the results down
export default function SearchFacets({ facets, filters, onToggle, onClear }: Readonly<{
    facets: Facets | undefined,
    filters: Filters,
    onToggle: (field: FacetField, value: string) => void,
    onClear: () => void,
}>) {
    const [ open, setOpen ] = useState<FacetField | null>(null)
    const [ journalQuery, setJournalQuery ] = useState("")
    const container = useRef<HTMLDivElement>(null)
    const triggers = useRef<Partial<Record<FacetField, HTMLButtonElement | null>>>({})
    const findBox = useRef<HTMLInputElement>(null)

    // a long journal list opens ready to type into
    useEffect(() => {
        if (open === "journal") findBox.current?.focus()
    }, [open])

    // close on a click outside or Escape, handing focus back to the button that opened it
    useEffect(() => {
        if (!open) return
        const onPointerDown = (e: PointerEvent) => {
            if (!container.current?.contains(e.target as Node)) setOpen(null)
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return
            triggers.current[open]?.focus()
            setOpen(null)
        }
        document.addEventListener("pointerdown", onPointerDown)
        document.addEventListener("keydown", onKeyDown)
        return () => {
            document.removeEventListener("pointerdown", onPointerDown)
            document.removeEventListener("keydown", onKeyDown)
        }
    }, [open])

    const groups = FACET_FIELDS.map((field) => ({ field, options: facetOptions(facets, filters, field) })).filter((g) => g.options.length > 0)
    if (groups.length === 0) return null

    function toggleMenu(field: FacetField) {
        setOpen((current) => current === field ? null : field)
        setJournalQuery("")
    }

    return (
        <div className={styles.facets} role="group" aria-label="Filter results" ref={container}>
            {groups.map(({ field, options }) => {
                const label = FACET_LABEL[field]
                const picked = filters[field].length
                const findable = field === "journal" && options.length > JOURNAL_FIND_THRESHOLD
                const needle = journalQuery.trim().toLowerCase()
                const shown = findable && needle ? options.filter((o) => o.value.toLowerCase().includes(needle)) : options
                const menuId = `facet-menu-${field}`
                return (
                    <div key={field} className={styles.facet}>
                        <button
                            type="button"
                            ref={(el) => { triggers.current[field] = el }}
                            className={`${styles.trigger} ${picked ? styles.triggerActive : ""}`}
                            aria-expanded={open === field}
                            aria-controls={menuId}
                            aria-label={picked ? `${label}, ${picked} selected` : label}
                            onClick={() => toggleMenu(field)}
                        >
                            {label}
                            {picked ? <span className={styles.badge} aria-hidden="true">{picked}</span> : null}
                            <svg className={`${styles.chevron} ${open === field ? styles.chevronOpen : ""}`} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                                <path d="M6 9l6 6 6-6" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        {open === field ?
                            <div id={menuId} className={`${styles.menu} ${field === "journal" ? styles.journalMenu : ""}`} role="dialog" aria-label={`${label} filters`}>
                                {findable ?
                                    <input
                                        ref={findBox}
                                        type="search"
                                        className={styles.find}
                                        placeholder="Find a journal"
                                        aria-label="Find a journal"
                                        value={journalQuery}
                                        onChange={(e) => setJournalQuery(e.target.value)}
                                    />
                                    : null}
                                <ul className={`${styles.options} ${field === "year" ? styles.yearOptions : ""}`}>
                                    {shown.map(({ value, count }) => (
                                        <li key={value}>
                                            <label className={styles.option} title={value}>
                                                <input type="checkbox" aria-label={`${value}, ${count} ${count === 1 ? "study" : "studies"}`} checked={filters[field].includes(value)} onChange={() => onToggle(field, value)} />
                                                <span className={styles.value}>{value}</span>
                                                <span className={styles.count}>{count}</span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                                {shown.length === 0 ? <p className={styles.none}>No journals match</p> : null}
                            </div>
                            : null}
                    </div>
                )
            })}
            {hasFilters(filters) ? <button type="button" className={styles.clear} onClick={onClear}>Clear filters</button> : null}
        </div>
    )
}
