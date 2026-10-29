// Year and journal filters for the research search, kept in the URL (?year=2021&year=2020&journal=...)
// so paging, back/forward and shared links keep them. Values within a facet are OR'd, facets AND'd.

export const FACET_FIELDS = ["year", "journal"] as const
export type FacetField = typeof FACET_FIELDS[number]
export type Filters = Record<FacetField, string[]>
export type FacetCount = { value: string, count: number }
export type Facets = Record<FacetField, FacetCount[]>

export const FACET_LABEL: Record<FacetField, string> = { year: "Year", journal: "Journal" }

export const noFilters = (): Filters => ({ year: [], journal: [] })

type ParamsLike = { getAll(name: string): string[] }

export function readFilters(params: ParamsLike | null | undefined): Filters {
    const filters = noFilters()
    if (!params) return filters
    for (const field of FACET_FIELDS) {
        filters[field] = [...new Set(params.getAll(field).map((v) => v.trim()).filter(Boolean))]
    }
    // the backend only accepts four-digit years
    filters.year = filters.year.filter((y) => /^\d{4}$/.test(y))
    return filters
}

export function toggleFilter(filters: Filters, field: FacetField, value: string): Filters {
    const picked = filters[field].includes(value)
    return { ...filters, [field]: picked ? filters[field].filter((v) => v !== value) : [...filters[field], value] }
}

export const hasFilters = (filters: Filters) => FACET_FIELDS.some((field) => filters[field].length > 0)

// "" when nothing is picked, otherwise "?year=...&journal=..." (sorted, so the same filters give the same URL)
export function filterQuery(filters: Filters): string {
    const params = new URLSearchParams()
    for (const field of FACET_FIELDS) {
        for (const value of [...filters[field]].sort((a, b) => a.localeCompare(b))) params.append(field, value)
    }
    const query = params.toString()
    return query ? `?${query}` : ""
}

// Picked values stay listed even when the current search has none of them, so they can be unpicked
export function facetOptions(facets: Facets | undefined, filters: Filters, field: FacetField): FacetCount[] {
    const counts = facets?.[field] ?? []
    const missing = filters[field].filter((value) => !counts.some((c) => c.value === value)).map((value) => ({ value, count: 0 }))
    return [...counts, ...missing]
}
