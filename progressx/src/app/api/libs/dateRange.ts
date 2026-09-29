const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

function isValidDate(value: string | null): value is string {
    return value !== null && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

// Reads ?from=YYYY-MM-DD&to=YYYY-MM-DD, both inclusive. Dates come from the browser so they follow
// the user's own calendar day, not the server's. Returns null when missing, malformed, reversed, or
// longer than maxDays.
export function readDateRange(searchParams: URLSearchParams, maxDays = 400): { from: string, to: string } | null {
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (!isValidDate(from) || !isValidDate(to)) return null

    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
    if (span < 0 || span > maxDays) return null
    return { from, to }
}

export function isDateString(value: unknown): value is string {
    return typeof value === "string" && isValidDate(value)
}

const PAGE_SIZE = 1000 // PostgREST's default row cap per request

// Runs a range query page by page until every row is loaded
export async function fetchAllPages<T>(
    query: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: unknown }>
): Promise<T[]> {
    const rows: T[] = []
    for (let start = 0; ; start += PAGE_SIZE) {
        const { data, error } = await query(start, start + PAGE_SIZE - 1)
        if (error) throw error
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE_SIZE) return rows
    }
}
