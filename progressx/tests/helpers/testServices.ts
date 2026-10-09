import { readFileSync } from "node:fs"
import path from "node:path"

// The throwaway services from ci/test/docker-compose.yml (npm run test:services). Never the live ones:
// the live Solr is on 8983 and the live search backend on 8000.
export const TEST_SOLR_URL = (process.env.SOLR_TEST_URL ?? "http://127.0.0.1:8984/solr").replace(/\/$/, "")
export const TEST_SEARCH_BACKEND_URL = process.env.SEARCH_BACKEND_TEST_URL ?? "http://127.0.0.1:8001"

export const fixture = <T = Record<string, unknown>[]>(name: string): T =>
    JSON.parse(readFileSync(path.resolve(__dirname, "../../../ci/test/fixtures", name), "utf8"))

async function solr(core: string, body: unknown) {
    if (/:8983\b/.test(TEST_SOLR_URL)) throw new Error("Refusing to write to what looks like the live Solr")
    const res = await fetch(`${TEST_SOLR_URL}/${core}/update?commit=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Solr ${core} update failed: ${res.status} ${await res.text()}`)
}

// Empties a test core and loads documents into it
export async function resetCore(core: string, docs: unknown[]) {
    await solr(core, { delete: { query: "*:*" } })
    if (docs.length) await solr(core, docs)
}

export async function servicesUp(): Promise<boolean> {
    try {
        const [solrPing, backend] = await Promise.all([
            fetch(`${TEST_SOLR_URL}/foods/admin/ping?wt=json`, { signal: AbortSignal.timeout(2000) }),
            fetch(`${TEST_SEARCH_BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) }),
        ])
        return solrPing.ok && backend.ok
    } catch {
        return false
    }
}
