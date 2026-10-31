import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, params, useTestAuthEnv } from "../helpers/auth"
import { ALL_MICRONUTRIENT_NAMES } from "@/app/internal_components/mydiet/microNutrients"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const log = await import("@/app/api/diet/log/route")
const logEntry = await import("@/app/api/diet/log/[id]/route")
const summary = await import("@/app/api/diet/log/summary/route")
const foodItems = await import("@/app/api/diet/food-items/route")
const foodItem = await import("@/app/api/diet/food-items/[id]/route")
const water = await import("@/app/api/diet/water/route")
const waterEntry = await import("@/app/api/diet/water/[id]/route")
const preferences = await import("@/app/api/diet/preferences/route")
const stats = await import("@/app/api/stats/diet/route")

const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"
const oats = { name: "Oats", servingQty: 40, servingUnit: "g", calories: 150, proteinG: 5, carbsG: 27, fatsG: 3, fiberG: 4, micronutrients: { Iron: 1.5 }, logDate: "2026-10-01" }

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
})

const addFood = async (body: unknown, userId = alice) => log.POST(await apiRequest("/api/diet/log", { method: "POST", userId, body }))

describe("/api/diet/log", () => {
    it("requires a signed-in user", async () => {
        expect((await log.GET(await apiRequest("/api/diet/log"))).status).toBe(401)
        expect((await addFood(oats, null as unknown as string)).status).toBe(401)
        expect((await logEntry.PATCH(await apiRequest("/api/diet/log/x", { method: "PATCH", body: {} }), params({ id: "x" }))).status).toBe(401)
        expect((await logEntry.DELETE(await apiRequest("/api/diet/log/x", { method: "DELETE" }), params({ id: "x" }))).status).toBe(401)
        expect((await summary.GET(await apiRequest("/api/diet/log/summary"))).status).toBe(401)
    })

    it("logs a food as a snapshot and lists the day back in order", async () => {
        const created = await addFood(oats)
        expect(created.status).toBe(201)
        expect((await created.json()).entry).toMatchObject({ name: "Oats", serving_qty: 40, calories: 150, micronutrients: { Iron: 1.5 }, food_item_id: null, catalog_item_id: null })
        await addFood({ name: "Banana", logDate: "2026-10-01" })
        await addFood({ name: "Toast", logDate: "2026-10-02" })

        const res = await log.GET(await apiRequest("/api/diet/log?date=2026-10-01", { userId: alice }))
        const { entries } = await res.json()
        expect(entries.map((e: { name: string }) => e.name)).toEqual(["Oats", "Banana"])
        // defaults for what wasn't given
        expect(entries[1]).toMatchObject({ serving_qty: 1, serving_unit: "serving", calories: 0, micronutrients: {} })
    })

    it("needs a name", async () => {
        const res = await addFood({ calories: 100 })
        expect(res.status).toBe(400)
        expect(fakeDb.rows("food_log_entries")).toEqual([])
    })

    it("can save the food to the quick-add catalog, updating one with the same name", async () => {
        fakeDb.seed("food_items", [{ id: "item-1", user_id: alice, name: "OATS", calories: 1 }])
        const res = await addFood({ ...oats, saveToCatalog: true })
        expect((await res.json()).entry).toMatchObject({ food_item_id: "item-1", catalog_item_id: "item-1" })
        expect(fakeDb.rows("food_items")).toEqual([expect.objectContaining({ id: "item-1", name: "Oats", calories: 150, serving_size: 40 })])

        await addFood({ name: "Rice 100%_white", saveToCatalog: true })
        expect(fakeDb.rows("food_items").map((i) => i.name)).toEqual(["Oats", "Rice 100%_white"])
    })

    it("still logs the food when saving to the catalog fails", async () => {
        fakeDb.failOn("food_items", "select")
        const res = await addFood({ ...oats, saveToCatalog: true })
        expect(res.status).toBe(201)
        // the catalog lookup failed too, so no entry is marked as saved
        expect((await res.json()).entry).toMatchObject({ name: "Oats", food_item_id: null, catalog_item_id: null })
    })

    it("marks entries saved by their link or, for older entries, by name", async () => {
        fakeDb.seed("food_items", [{ id: "item-1", user_id: alice, name: "Oats" }, { id: "item-2", user_id: bob, name: "Banana" }])
        fakeDb.seed("food_log_entries", [
            { id: "e1", user_id: alice, log_date: "2026-10-01", name: " oats ", food_item_id: null, created_at: "1" },
            { id: "e2", user_id: alice, log_date: "2026-10-01", name: "Banana", food_item_id: "deleted-item", created_at: "2" },
        ])
        const res = await log.GET(await apiRequest("/api/diet/log?date=2026-10-01", { userId: alice }))
        expect((await res.json()).entries.map((e: { catalog_item_id: unknown }) => e.catalog_item_id)).toEqual(["item-1", null])
    })

    it("falls back to each entry's own link when the catalog can't be read", async () => {
        fakeDb.seed("food_log_entries", [{ id: "e1", user_id: alice, log_date: "2026-10-01", name: "Oats", food_item_id: "item-9" }])
        fakeDb.failOn("food_items")
        const res = await log.GET(await apiRequest("/api/diet/log?date=2026-10-01", { userId: alice }))
        expect(res.status).toBe(200)
        expect((await res.json()).entries[0].catalog_item_id).toBe("item-9")
    })

    it("reports database errors", async () => {
        fakeDb.failOn("food_log_entries")
        expect((await log.GET(await apiRequest("/api/diet/log", { userId: alice }))).status).toBe(500)
        expect((await addFood(oats)).status).toBe(500)
    })

    it("reports a body that isn't JSON", async () => {
        const req = await apiRequest("/api/diet/log", { method: "POST", userId: alice })
        const broken = new Request(req.url, { method: "POST", headers: req.headers, body: "{not json" })
        const res = await log.POST(Object.assign(broken, { cookies: req.cookies }) as typeof req)
        expect(res.status).toBe(500)
        expect((await res.json()).message).toMatch(/^Error adding food log entry: /)
    })
})

describe("/api/diet/log/[id]", () => {
    const edit = async (id: string, body: unknown, userId = alice) =>
        logEntry.PATCH(await apiRequest(`/api/diet/log/${id}`, { method: "PATCH", userId, body }), params({ id }))

    it("edits only the allowed fields of the user's own entry", async () => {
        const id = (await (await addFood(oats)).json()).entry.id
        const res = await edit(id, { calories: 200, servingQty: 60, user_id: bob, id: "hijack" })
        expect(res.status).toBe(200)
        const row = fakeDb.rows("food_log_entries")[0]
        expect(row).toMatchObject({ id, user_id: alice, calories: 200, serving_qty: 60 })
        expect(row.updated_at).toEqual(expect.any(String))
    })

    it("can't edit another user's entry", async () => {
        const id = (await (await addFood(oats, bob)).json()).entry.id
        expect((await edit(id, { calories: 1 })).status).toBe(500)
        expect(fakeDb.rows("food_log_entries")[0].calories).toBe(150)
    })

    it("saves an edited entry to the catalog and links it", async () => {
        const id = (await (await addFood(oats)).json()).entry.id
        const res = await edit(id, { name: "Steel-cut oats", saveToCatalog: true })
        const { entry } = await res.json()
        const item = fakeDb.rows("food_items")[0]
        expect(item).toMatchObject({ name: "Steel-cut oats", calories: 150, micronutrients: { Iron: 1.5 } })
        expect(entry).toMatchObject({ food_item_id: item.id, catalog_item_id: item.id })

        // already linked: nothing new is saved
        await edit(id, { calories: 160, saveToCatalog: true })
        expect(fakeDb.rows("food_items")).toHaveLength(1)
    })

    it("says so when the catalog save worked but the link didn't", async () => {
        const id = (await (await addFood(oats)).json()).entry.id
        let updates = 0
        const from = fakeDb.from.bind(fakeDb)
        vi.spyOn(fakeDb, "from").mockImplementation((table: string) => {
            const query = from(table)
            if (table !== "food_log_entries") return query
            const update = query.update.bind(query)
            query.update = (values) => (++updates === 2 ? (fakeDb.failOn("food_log_entries", "update"), update(values)) : update(values))
            return query
        })
        const res = await edit(id, { saveToCatalog: true })
        expect(res.status).toBe(500)
        expect((await res.json()).message).toBe("Saved to catalog, but couldn't link the entry")
        expect(fakeDb.rows("food_items")).toHaveLength(1)
    })

    it("reports a catalog save that fails", async () => {
        const id = (await (await addFood(oats)).json()).entry.id
        fakeDb.failOn("food_items", "insert", { message: "disk full" })
        const res = await edit(id, { saveToCatalog: true })
        expect(res.status).toBe(500)
        expect(fakeDb.rows("food_log_entries")[0].food_item_id).toBeNull()
    })

    it("deletes only the user's own entry", async () => {
        const mine = (await (await addFood(oats)).json()).entry.id
        const theirs = (await (await addFood(oats, bob)).json()).entry.id
        const remove = async (id: string) => logEntry.DELETE(await apiRequest(`/api/diet/log/${id}`, { method: "DELETE", userId: alice }), params({ id }))
        expect((await remove(theirs)).status).toBe(200)
        expect((await remove(mine)).status).toBe(200)
        expect(fakeDb.rows("food_log_entries").map((e) => e.id)).toEqual([theirs])

        fakeDb.failOn("food_log_entries", "delete")
        expect((await remove(theirs)).status).toBe(500)
    })
})

describe("/api/diet/log/summary", () => {
    it("lists each logged day of the month once", async () => {
        for (const logDate of ["2026-02-01", "2026-02-01", "2026-02-28", "2026-03-01", "2026-01-31"]) await addFood({ name: "Oats", logDate })
        await addFood({ name: "Oats", logDate: "2026-02-10" }, bob)
        const res = await summary.GET(await apiRequest("/api/diet/log/summary?month=2026-02", { userId: alice }))
        expect(await res.json()).toEqual({ month: "2026-02", loggedDates: ["2026-02-01", "2026-02-28"] })
    })

    it("uses the current month for a missing or malformed month", async () => {
        const res = await summary.GET(await apiRequest("/api/diet/log/summary?month=Feb", { userId: alice }))
        expect((await res.json()).month).toBe(new Date().toISOString().slice(0, 7))
    })

    it("reports database errors", async () => {
        fakeDb.failOn("food_log_entries")
        expect((await summary.GET(await apiRequest("/api/diet/log/summary", { userId: alice }))).status).toBe(500)
    })
})

describe("/api/diet/food-items", () => {
    const create = async (body: unknown, userId: string | null = alice) => foodItems.POST(await apiRequest("/api/diet/food-items", { method: "POST", userId, body }))
    const edit = async (id: string, body: unknown, userId: string | null = alice) =>
        foodItem.PATCH(await apiRequest(`/api/diet/food-items/${id}`, { method: "PATCH", userId, body }), params({ id }))
    const remove = async (id: string, userId: string | null = alice) =>
        foodItem.DELETE(await apiRequest(`/api/diet/food-items/${id}`, { method: "DELETE", userId }), params({ id }))

    it("requires a signed-in user", async () => {
        expect((await foodItems.GET(await apiRequest("/api/diet/food-items"))).status).toBe(401)
        expect((await create({ name: "Oats" }, null)).status).toBe(401)
        expect((await edit("x", {}, null)).status).toBe(401)
        expect((await remove("x", null)).status).toBe(401)
    })

    it("saves catalog items and searches them by name, alphabetically", async () => {
        expect((await create({ name: "Rolled oats", calories: 150, servingSize: 40 })).status).toBe(201)
        await create({ name: "Banana" })
        await create({ name: "Oat milk" })
        await create({ name: "Oatcakes" }, bob)

        const all = await (await foodItems.GET(await apiRequest("/api/diet/food-items", { userId: alice }))).json()
        expect(all.items.map((i: { name: string }) => i.name)).toEqual(["Banana", "Oat milk", "Rolled oats"])
        const found = await (await foodItems.GET(await apiRequest("/api/diet/food-items?search=OAT", { userId: alice }))).json()
        expect(found.items.map((i: { name: string }) => i.name)).toEqual(["Oat milk", "Rolled oats"])
        expect(found.items[1]).toMatchObject({ serving_size: 40, serving_unit: "serving", calories: 150, protein_g: 0 })
    })

    it("needs a name", async () => {
        expect((await create({ calories: 5 })).status).toBe(400)
    })

    it("edits and deletes only the user's own items", async () => {
        const mine = (await (await create({ name: "Oats" })).json()).item.id
        const theirs = (await (await create({ name: "Rice" }, bob)).json()).item.id

        const res = await edit(mine, { calories: 99, user_id: bob })
        expect((await res.json()).item).toMatchObject({ name: "Oats", calories: 99, user_id: alice })
        expect((await edit(theirs, { calories: 99 })).status).toBe(500)

        await remove(theirs)
        await remove(mine)
        expect(fakeDb.rows("food_items").map((i) => i.id)).toEqual([theirs])
    })

    it("reports database errors", async () => {
        fakeDb.failOn("food_items")
        expect((await foodItems.GET(await apiRequest("/api/diet/food-items", { userId: alice }))).status).toBe(500)
        expect((await create({ name: "Oats" })).status).toBe(500)
        expect((await remove("x")).status).toBe(500)
    })

    it("reports a body that isn't JSON", async () => {
        const bad = async (url: string, method: string) => {
            const req = await apiRequest(url, { method, userId: alice })
            return Object.assign(new Request(req.url, { method, headers: req.headers, body: "nope" }), { cookies: req.cookies }) as typeof req
        }
        expect((await foodItems.POST(await bad("/api/diet/food-items", "POST"))).status).toBe(500)
        expect((await foodItem.PATCH(await bad("/api/diet/food-items/x", "PATCH"), params({ id: "x" }))).status).toBe(500)
        expect((await logEntry.PATCH(await bad("/api/diet/log/x", "PATCH"), params({ id: "x" }))).status).toBe(500)
    })
})

describe("/api/diet/water", () => {
    const drink = async (body: unknown, userId: string | null = alice) => water.POST(await apiRequest("/api/diet/water", { method: "POST", userId, body }))
    const remove = async (id: string, userId: string | null = alice) =>
        waterEntry.DELETE(await apiRequest(`/api/diet/water/${id}`, { method: "DELETE", userId }), params({ id }))

    it("requires a signed-in user", async () => {
        expect((await water.GET(await apiRequest("/api/diet/water"))).status).toBe(401)
        expect((await drink({ amountMl: 250 }, null)).status).toBe(401)
        expect((await remove("x", null)).status).toBe(401)
    })

    it("logs drinks for a day, with the custom goal from Settings", async () => {
        expect((await drink({ amountMl: 249.6, logDate: "2026-10-01" })).status).toBe(201)
        await drink({ amountMl: 500, logDate: "2026-10-01" })
        await drink({ amountMl: 500, logDate: "2026-10-02" })
        fakeDb.seed("user_settings", [{ user_id: alice, water_goal_ml: 3000 }])

        const body = await (await water.GET(await apiRequest("/api/diet/water?date=2026-10-01", { userId: alice }))).json()
        expect(body.entries.map((e: { amount_ml: number }) => e.amount_ml)).toEqual([250, 500])
        expect(body.customGoalMl).toBe(3000)
    })

    it("has no custom goal until one is set", async () => {
        const body = await (await water.GET(await apiRequest("/api/diet/water", { userId: alice }))).json()
        expect(body).toEqual({ entries: [], customGoalMl: null })
    })

    it.each([0, -5, 5001, "lots", null])("rejects amountMl %j", async (amountMl) => {
        expect((await drink({ amountMl })).status).toBe(400)
        expect(fakeDb.rows("water_log_entries")).toEqual([])
    })

    it("deletes only the user's own drinks", async () => {
        const mine = (await (await drink({ amountMl: 250 })).json()).entry.id
        const theirs = (await (await drink({ amountMl: 250 }, bob)).json()).entry.id
        expect((await remove(theirs)).status).toBe(404)
        expect((await remove(mine)).status).toBe(200)
        expect(fakeDb.rows("water_log_entries").map((e) => e.id)).toEqual([theirs])
    })

    it("reports database errors", async () => {
        fakeDb.failOn("user_settings")
        expect((await water.GET(await apiRequest("/api/diet/water", { userId: alice }))).status).toBe(500)
        fakeDb.failOn("water_log_entries")
        expect((await drink({ amountMl: 250 })).status).toBe(500)
        expect((await remove("x")).status).toBe(500)
    })

    it("reports a body that isn't JSON", async () => {
        const req = await apiRequest("/api/diet/water", { method: "POST", userId: alice })
        const res = await water.POST(Object.assign(new Request(req.url, { method: "POST", headers: req.headers, body: "{" }), { cookies: req.cookies }) as typeof req)
        expect(res.status).toBe(500)
    })
})

describe("/api/diet/preferences", () => {
    const save = async (body: unknown, userId: string | null = alice) => preferences.POST(await apiRequest("/api/diet/preferences", { method: "POST", userId, body }))
    const load = async () => (await preferences.GET(await apiRequest("/api/diet/preferences", { userId: alice }))).json()

    it("requires a signed-in user", async () => {
        expect((await preferences.GET(await apiRequest("/api/diet/preferences"))).status).toBe(401)
        expect((await save({}, null)).status).toBe(401)
    })

    it("defaults to every micronutrient and Maintain", async () => {
        expect(await load()).toEqual({ displayedMicronutrients: ALL_MICRONUTRIENT_NAMES, goalState: "Maintain" })
    })

    it("saves the goal and the shown micronutrients separately, dropping unknown names", async () => {
        const [first, second] = ALL_MICRONUTRIENT_NAMES
        expect(await (await save({ displayedMicronutrients: [first, "Kryptonite", 7, second] })).json()).toEqual({ displayedMicronutrients: [first, second], goalState: null })
        await save({ goalState: "Deficit" })
        expect(await load()).toEqual({ displayedMicronutrients: [first, second], goalState: "Deficit" })
        expect(fakeDb.rows("diet_config")).toHaveLength(1)
    })

    it.each([
        [{ displayedMicronutrients: "Iron" }, "displayedMicronutrients must be an array"],
        [{ goalState: "Bulk" }, "goalState must be one of Deficit, Maintain, Surplus"],
    ])("rejects %j", async (body, message) => {
        const res = await save(body)
        expect(res.status).toBe(400)
        expect((await res.json()).message).toBe(message)
    })

    it("reports database errors", async () => {
        fakeDb.failOn("diet_config")
        expect((await preferences.GET(await apiRequest("/api/diet/preferences", { userId: alice }))).status).toBe(500)
        expect((await save({ goalState: "Surplus" })).status).toBe(500)
        const req = await apiRequest("/api/diet/preferences", { method: "POST", userId: alice })
        expect((await preferences.POST(Object.assign(new Request(req.url, { method: "POST", headers: req.headers, body: "{" }), { cookies: req.cookies }) as typeof req)).status).toBe(500)
    })
})

describe("/api/stats/diet", () => {
    const load = async (query: string, userId: string | null = alice) => stats.GET(await apiRequest(`/api/stats/diet?${query}`, { userId }))

    it("requires a signed-in user and a valid range", async () => {
        expect((await load("from=2026-10-01&to=2026-10-07", null)).status).toBe(401)
        expect((await load("from=2026-10-07&to=2026-10-01")).status).toBe(400)
        expect((await load("from=Monday&to=2026-10-01")).status).toBe(400)
    })

    it("totals food and water per day, rounded, oldest first", async () => {
        fakeDb.seed("food_log_entries", [
            { id: "1", user_id: alice, log_date: "2026-10-02", calories: "100.04", protein_g: 10, carbs_g: 5, fats_g: 1, micronutrients: { Iron: 1.25 } },
            { id: "2", user_id: alice, log_date: "2026-10-02", calories: 200, protein_g: null, carbs_g: "x", fats_g: 2, micronutrients: { Iron: 1, Zinc: "2" } },
            { id: "3", user_id: alice, log_date: "2026-10-01", calories: 50, protein_g: 1, carbs_g: 1, fats_g: 1, micronutrients: null },
            { id: "4", user_id: alice, log_date: "2026-09-30", calories: 999 },
            { id: "5", user_id: bob, log_date: "2026-10-01", calories: 999 },
        ])
        fakeDb.seed("water_log_entries", [
            { id: "1", user_id: alice, log_date: "2026-10-03", amount_ml: 250 },
            { id: "2", user_id: alice, log_date: "2026-10-01", amount_ml: 500 },
            { id: "3", user_id: alice, log_date: "2026-10-01", amount_ml: null },
        ])
        fakeDb.seed("diet_config", [{ id: alice, goal_state: "Surplus", displayed_micronutrients: ["Iron"] }])
        fakeDb.seed("user_settings", [{ user_id: alice, water_goal_ml: 2500 }])

        const body = await (await load("from=2026-10-01&to=2026-10-07")).json()
        expect(body).toEqual({
            from: "2026-10-01",
            to: "2026-10-07",
            days: [
                { date: "2026-10-01", foods: 1, calories: 50, protein: 1, carbs: 1, fats: 1, micronutrients: {}, waterMl: 500 },
                { date: "2026-10-02", foods: 2, calories: 300, protein: 10, carbs: 5, fats: 3, micronutrients: { Iron: 2.3, Zinc: 2 }, waterMl: 0 },
                { date: "2026-10-03", foods: 0, calories: 0, protein: 0, carbs: 0, fats: 0, micronutrients: {}, waterMl: 250 },
            ],
            goalState: "Surplus",
            displayedMicronutrients: ["Iron"],
            customWaterGoalMl: 2500,
        })
    })

    it("falls back to the default settings", async () => {
        const body = await (await load("from=2026-10-01&to=2026-10-07")).json()
        expect(body).toMatchObject({ days: [], goalState: "Maintain", displayedMicronutrients: ALL_MICRONUTRIENT_NAMES, customWaterGoalMl: null })
    })

    it.each(["diet_config", "user_settings", "water_log_entries"])("reports a failing %s query", async (table) => {
        fakeDb.failOn(table)
        expect((await load("from=2026-10-01&to=2026-10-07")).status).toBe(500)
    })
})
