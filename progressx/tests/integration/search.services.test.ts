import { NextRequest } from "next/server"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fixture, resetCore, servicesUp, TEST_SEARCH_BACKEND_URL, TEST_SOLR_URL } from "../helpers/testServices"

// Real services: the app's food search against a Solr core built from the committed configset, and the
// /api/search proxy against the real search backend (FastAPI + Redis). Start them with npm run test:services.
const up = await servicesUp()
if (!up && process.env.CI) throw new Error("Test services aren't running (npm run test:services)")

describe.skipIf(!up)("food database (Solr foods core)", () => {
    beforeAll(async () => {
        vi.stubEnv("FOODS_SOLR_URL", `${TEST_SOLR_URL}/foods`)
        await resetCore("foods", fixture("foods.json"))
    })
    beforeEach(() => vi.stubEnv("FOODS_SOLR_URL", `${TEST_SOLR_URL}/foods`))

    const load = () => import("@/app/api/libs/foodDatabase")

    it("puts the generic food first and parses nutrients and portions", async () => {
        const { searchFoods } = await load()
        const { matches, loose } = await searchFoods("beef stew")
        expect(loose).toBe(false)
        expect(matches[0]).toEqual({
            id: "survey-1001", name: "Stew, beef", source: "USDA FoodData Central (FNDDS)", category: "Stews",
            per100g: { calories: 98, proteinG: 7.6, carbsG: 6.4, fatsG: 4.6, fiberG: 1.1, Sodium: 310, Iron: 1.2 },
            portions: [{ label: "1 cup", grams: 245 }],
        })
    })

    it("ranks the plain version and generic entries above flavoured or branded ones", async () => {
        const { searchFoods } = await load()
        expect((await searchFoods("greek yogurt")).matches[0].name).toBe("Yogurt, Greek, plain, nonfat")
        expect((await searchFoods("hamburger")).matches[0].name).toBe("Hamburger, double patty, on bun")
    })

    it("falls back to partial matches and says so", async () => {
        const { searchFoods, describeMatches } = await load()
        const result = await searchFoods("kimchi stew")
        expect(result.loose).toBe(true)
        expect(result.matches.map((m) => m.name)).toContain("Stew, beef")
        expect(describeMatches(result.matches, result.loose)).toMatch(/^No food had all of those words/)
    })

    it("strips Solr syntax from the query", async () => {
        const { searchFoods } = await load()
        await expect(searchFoods('name:* OR id:"survey-1001" {!xmlparser}')).resolves.toBeTruthy()
        expect(await searchFoods("!!!")).toEqual({ matches: [], loose: false })
    })

    it("looks foods up by id, and only well-formed ids", async () => {
        const { getFood } = await load()
        expect((await getFood("cnf-3001"))?.name).toBe("Egg, whole, raw")
        expect(await getFood("survey-999999")).toBeNull()
        expect(await getFood('survey-1" OR "x')).toBeNull()
    })
})

describe.skipIf(!up)("/api/search proxy -> search backend -> Solr", () => {
    beforeAll(async () => {
        await resetCore("clean_ingestion_data", fixture("studies.json"))
    })
    beforeEach(() => vi.stubEnv("SEARCH_BACKEND_URL", TEST_SEARCH_BACKEND_URL))

    const get = async (path: string) => {
        const { GET } = await import("@/app/api/search/[...path]/route")
        return GET(new NextRequest(new URL(path, "http://localhost:3000")))
    }

    it("returns the backend's results and cache status", async () => {
        const res = await get("/api/search/search/0/sleep%20recovery")
        expect(res.status).toBe(200)
        expect(["HIT", "MISS"]).toContain(res.headers.get("X-Cache"))
        const body = await res.json()
        expect(body.docs.map((d: { title: string }) => d.title)).toEqual(["Sleep duration and recovery"])
    })

    it("keeps encoded slashes and spaces in the query", async () => {
        const res = await get("/api/search/search/0/protein%20intake%2Fhypertrophy")
        expect(res.status).toBe(200)
    })

    it("answers 502 when the backend is down", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {})
        vi.stubEnv("SEARCH_BACKEND_URL", "http://127.0.0.1:9")
        expect((await get("/api/search/search/0/x")).status).toBe(502)
    })

    it("answers 500 when it isn't configured", async () => {
        vi.stubEnv("SEARCH_BACKEND_URL", "")
        expect((await get("/api/search/search/0/x")).status).toBe(500)
    })
})
