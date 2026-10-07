// Looks a question up on Google and returns the AI Overview as plain text (plus the pages it cites),
// via SerpApi (https://serpapi.com/ai-overview) - Google has no API for AI Overviews, and scraping
// google.com directly gets blocked. Needs SERPAPI_API_KEY; every uncached lookup uses one search
// from that account's quota, so results are cached in memory for a while.

export type OverviewSource = { title: string, link: string }

export type OverviewResult = {
    query: string
    // "ai_overview" when Google showed one, otherwise the best other answer on the results page
    kind: "ai_overview" | "answer_box" | "search_snippets"
    text: string
    sources: OverviewSource[]
}

export class OverviewUnavailableError extends Error {}

const SERPAPI_URL = "https://serpapi.com/search.json"
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_MAX = 500
const MAX_TEXT = 6000

const cache = new Map<string, { at: number, result: OverviewResult }>()

type Block = {
    type?: string
    snippet?: string
    title?: string
    list?: Block[]
    text_blocks?: Block[]
    table?: unknown[][]
    formatted?: Record<string, unknown>[]
}

// AI Overview text comes back as nested blocks (paragraphs, headings, lists, tables); flatten them to text
function flattenBlocks(blocks: Block[] | undefined, depth = 0): string[] {
    const lines: string[] = []
    for (const block of blocks ?? []) {
        const indent = "  ".repeat(depth)
        const text = [block.title, block.snippet].filter(Boolean).join(": ")
        if (text) lines.push(block.type === "heading" ? `\n${text}` : `${indent}${block.type === "list" || depth > 0 ? "- " : ""}${text}`)
        if (block.list) lines.push(...flattenBlocks(block.list, depth + 1))
        if (block.text_blocks) lines.push(...flattenBlocks(block.text_blocks, depth + 1))
        if (Array.isArray(block.table)) {
            for (const row of block.table) if (Array.isArray(row)) lines.push(`${indent}| ${row.map(String).join(" | ")} |`)
        } else if (Array.isArray(block.formatted)) {
            for (const row of block.formatted) lines.push(`${indent}| ${Object.values(row).map(String).join(" | ")} |`)
        }
    }
    return lines
}

function toSources(references: unknown): OverviewSource[] {
    if (!Array.isArray(references)) return []
    return references
        .filter((ref) => ref && typeof ref.link === "string" && /^https?:\/\//.test(ref.link))
        .slice(0, 6)
        .map((ref) => ({ title: String(ref.title ?? ref.source ?? ref.link).slice(0, 160), link: ref.link as string }))
}

async function serpapi(params: Record<string, string>, apiKey: string) {
    const url = new URL(SERPAPI_URL)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    url.searchParams.set("api_key", apiKey)

    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || json.error) {
        // never log the url: it carries the api key
        console.log(`SerpApi lookup failed (${res.status}): ${json?.error ?? "no details"}`)
        throw new OverviewUnavailableError("Google lookup failed")
    }
    return json
}

export async function googleOverview(rawQuery: string): Promise<OverviewResult> {
    const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, 200)
    if (!query) throw new OverviewUnavailableError("Empty search")

    const apiKey = process.env.SERPAPI_API_KEY
    if (!apiKey) {
        console.log("Google overview lookup skipped: SERPAPI_API_KEY is not set")
        throw new OverviewUnavailableError("Google lookups aren't available right now")
    }

    const key = query.toLowerCase()
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result

    const page = await serpapi({ engine: "google", q: query, hl: "en", gl: "ca" }, apiKey)

    let overview = page.ai_overview
    // sometimes the overview loads separately and has to be fetched with its token (valid ~1 minute)
    if (overview?.page_token && !overview.text_blocks) {
        try {
            overview = (await serpapi({ engine: "google_ai_overview", page_token: overview.page_token }, apiKey)).ai_overview ?? overview
        } catch {
            // fall through to the other answers on the page
        }
    }

    let result: OverviewResult
    const overviewText = flattenBlocks(overview?.text_blocks).join("\n").trim()
    if (overviewText) {
        result = { query, kind: "ai_overview", text: overviewText, sources: toSources(overview.references) }
    } else if (page.answer_box && (page.answer_box.snippet || page.answer_box.answer || page.answer_box.list)) {
        const box = page.answer_box
        const text = [box.title, box.answer, box.snippet, ...(Array.isArray(box.list) ? box.list : [])].filter(Boolean).join("\n")
        result = { query, kind: "answer_box", text, sources: box.link ? [{ title: String(box.title ?? box.link), link: box.link }] : [] }
    } else {
        const organic: { title?: string, link?: string, snippet?: string }[] = Array.isArray(page.organic_results) ? page.organic_results.slice(0, 5) : []
        const text = organic.map((r) => `${r.title ?? ""}: ${r.snippet ?? ""}`).join("\n").trim()
        if (!text) throw new OverviewUnavailableError("Google returned nothing useful for that search")
        result = { query, kind: "search_snippets", text, sources: toSources(organic) }
    }
    result.text = result.text.slice(0, MAX_TEXT)

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
    cache.set(key, { at: Date.now(), result })
    return result
}
