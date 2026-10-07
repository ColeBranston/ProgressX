// Searches the in-house nutrition database: the `foods` Solr core, built from USDA FoodData Central
// and Health Canada's Canadian Nutrient File by data/foods/ingest_foods.py. Every food has its
// nutrients per 100 g (in the app's units) and its common portion sizes in grams.

export type Portion = { label: string, grams: number }

export type FoodMatch = {
    id: string
    name: string
    source: string
    category: string
    // per 100 g: calories, proteinG, carbsG, fatsG, fiberG and the micronutrients by their app names
    per100g: Record<string, number>
    portions: Portion[]
}

const ROWS = 8
const ID_PATTERN = /^(survey|sr_legacy|foundation|cnf)-\d+$/

function baseUrl(): string {
    return (process.env.FOODS_SOLR_URL ?? "http://localhost:8983/solr/foods").replace(/\/$/, "")
}

type SolrDoc = { id: string, name: string, source: string, category?: string, nutrients: string, portions: string }

function toMatch(doc: SolrDoc): FoodMatch {
    let per100g: Record<string, number> = {}
    let portions: Portion[] = []
    try { per100g = JSON.parse(doc.nutrients) } catch { /* leave empty */ }
    try { portions = JSON.parse(doc.portions) } catch { /* leave empty */ }
    return { id: doc.id, name: doc.name, source: doc.source, category: doc.category ?? "", per100g, portions }
}

async function select(params: Record<string, string>): Promise<SolrDoc[]> {
    const url = new URL(`${baseUrl()}/select`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`Food database responded ${res.status}`)
    const json = await res.json()
    return json?.response?.docs ?? []
}

// loose: no food had every word, so these only match some of them ("beef" or "stew", not both)
export async function searchFoods(rawQuery: string): Promise<{ matches: FoodMatch[], loose: boolean }> {
    // keep words only, so the query can't use Solr syntax
    const query = rawQuery.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    if (!query) return { matches: [], loose: false }

    const params = {
        q: query,
        defType: "edismax",
        // what the food is (text before the first comma, e.g. "Stew" in "Stew, beef") counts most
        qf: "name^4 name_head^6 category",
        pf: "name^8",
        ps: "3",
        // generic, everyday entries first: shorter names, and survey foods (dishes as people eat them)
        boost: "product(boost,recip(name_length,0.04,1,0.6))",
        // and the plain version of a food over flavoured or mixed ones ("Yogurt, Greek, plain" over "... with oats")
        bq: "name:(plain raw NFS)^20",
        fl: "id,name,source,category,nutrients,portions",
        rows: String(ROWS),
        wt: "json",
    }
    const docs = await select({ ...params, mm: "2<-1 5<75%" })
    if (docs.length > 0) return { matches: docs.map(toMatch), loose: false }
    // nothing matched every word ("oatmeal cooked with milk"): settle for any of them
    return { matches: (await select({ ...params, mm: "1" })).map(toMatch), loose: query.includes(" ") }
}

export async function getFood(id: string): Promise<FoodMatch | null> {
    if (!ID_PATTERN.test(id)) return null
    const docs = await select({ q: `id:"${id}"`, fl: "id,name,source,category,nutrients,portions", rows: "1", wt: "json" })
    return docs[0] ? toMatch(docs[0]) : null
}

// One line per match for the model: short enough for a small context, enough to choose well
export function describeMatches(matches: FoodMatch[], loose: boolean): string {
    if (matches.length === 0) return "No matches. Try simpler or different words (e.g. 'stew beef' instead of 'mom's beef stew')."
    const note = loose ? "No food had all of those words; these match only some of them.\n" : ""
    return note + matches.map((match) => {
        const kcal = Math.round(match.per100g.calories ?? 0)
        const portions = match.portions.slice(0, 4).map((p) => `${p.label} = ${Math.round(p.grams)} g`).join("; ")
        return `${match.id} | ${match.name} | ${kcal} kcal per 100 g${portions ? ` | ${portions}` : ""}`
    }).join("\n")
}
