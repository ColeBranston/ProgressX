import styles from "./searchfacets.module.css"
import { FACET_FIELDS, FACET_LABEL, FacetField, Facets, Filters, facetOptions, hasFilters } from "./researchFilters"

// Checkbox lists for narrowing a research search by year and journal
export default function SearchFacets({ facets, filters, onToggle, onClear }: {
    facets: Facets | undefined,
    filters: Filters,
    onToggle: (field: FacetField, value: string) => void,
    onClear: () => void,
}) {
    const groups = FACET_FIELDS.map((field) => ({ field, options: facetOptions(facets, filters, field) })).filter((g) => g.options.length > 0)
    if (groups.length === 0) return null

    return (
        <aside className={styles.facets} aria-label="Filter results">
            {groups.map(({ field, options }) => (
                <fieldset key={field} className={styles.group}>
                    <legend className={styles.legend}>{FACET_LABEL[field]}</legend>
                    <ul className={`${styles.options} ${field === "year" ? styles.yearOptions : ""}`}>
                        {options.map(({ value, count }) => (
                            <li key={value}>
                                <label className={styles.option}>
                                    <input type="checkbox" aria-label={`${value}, ${count} ${count === 1 ? "study" : "studies"}`} checked={filters[field].includes(value)} onChange={() => onToggle(field, value)} />
                                    <span className={styles.value}>{value}</span>
                                    <span className={styles.count}>{count}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </fieldset>
            ))}
            {hasFilters(filters) ? <button type="button" className={styles.clear} onClick={onClear}>Clear filters</button> : null}
        </aside>
    )
}
