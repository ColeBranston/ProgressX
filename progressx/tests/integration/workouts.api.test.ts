import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, useTestAuthEnv } from "../helpers/auth"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const { GET, POST, DELETE } = await import("@/app/api/workouts/sets/route")
const splits = await import("@/app/api/workouts/splits/route")

const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"
const set = { exerciseId: "barbell-bench-press", performedOn: "2026-10-01", weightKg: 100, reps: 5 }

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("/api/workouts/sets", () => {
    it("requires a signed-in user", async () => {
        expect((await GET(await apiRequest("/api/workouts/sets?from=2026-10-01&to=2026-10-02"))).status).toBe(401)
        expect((await POST(await apiRequest("/api/workouts/sets", { method: "POST", body: set }))).status).toBe(401)
    })

    it("logs a set and lists it back in the date range", async () => {
        const created = await POST(await apiRequest("/api/workouts/sets", { method: "POST", userId: alice, body: set }))
        expect(created.status).toBe(201)
        expect((await created.json()).set).toMatchObject({ exercise_id: "barbell-bench-press", weight_kg: 100, reps: 5, split_id: null })

        const listed = await GET(await apiRequest("/api/workouts/sets?from=2026-09-30&to=2026-10-01", { userId: alice }))
        expect((await listed.json()).sets).toHaveLength(1)
        const outside = await GET(await apiRequest("/api/workouts/sets?from=2026-10-02&to=2026-10-03", { userId: alice }))
        expect((await outside.json()).sets).toHaveLength(0)
    })

    it.each([
        [{ ...set, exerciseId: "constructor" }, "Unknown exerciseId"],
        [{ ...set, performedOn: "yesterday" }, "performedOn must be a YYYY-MM-DD date"],
        [{ ...set, weightKg: 5000 }, /weightKg must be/],
        [{ ...set, reps: 0 }, /reps a whole number/],
    ])("rejects %j", async (body, message) => {
        const res = await POST(await apiRequest("/api/workouts/sets", { method: "POST", userId: alice, body }))
        expect(res.status).toBe(400)
        expect((await res.json()).message).toMatch(message)
        expect(fakeDb.rows("workout_sets")).toHaveLength(0)
    })

    it("never shows or deletes another user's sets", async () => {
        await POST(await apiRequest("/api/workouts/sets", { method: "POST", userId: bob, body: set }))
        const bobsSet = fakeDb.rows("workout_sets")[0].id as string

        const listed = await GET(await apiRequest("/api/workouts/sets?from=2026-10-01&to=2026-10-01", { userId: alice }))
        expect((await listed.json()).sets).toEqual([])

        const deleted = await DELETE(await apiRequest("/api/workouts/sets", { method: "DELETE", userId: alice, body: { ids: [bobsSet] } }))
        expect(await deleted.json()).toEqual({ deleted: [] })
        expect(fakeDb.rows("workout_sets")).toHaveLength(1)
    })

    it("only links a set to the user's own split, and to a day that exists", async () => {
        const made = await splits.POST(await apiRequest("/api/workouts/splits", { method: "POST", userId: bob, body: { name: "PPL", days: [{ name: "Push", exercises: [] }] } }))
        expect(made.status).toBeLessThan(300)
        const bobsSplit = fakeDb.rows("workout_splits")[0].id

        const res = await POST(await apiRequest("/api/workouts/sets", { method: "POST", userId: alice, body: { ...set, splitId: bobsSplit, splitDayIndex: 0 } }))
        expect((await res.json()).set.split_id).toBeNull()

        const own = await POST(await apiRequest("/api/workouts/sets", { method: "POST", userId: bob, body: { ...set, splitId: bobsSplit, splitDayIndex: 0 } }))
        expect((await own.json()).set).toMatchObject({ split_id: bobsSplit, split_day_index: 0 })
        const pastEnd = await POST(await apiRequest("/api/workouts/sets", { method: "POST", userId: bob, body: { ...set, splitId: bobsSplit, splitDayIndex: 3 } }))
        expect((await pastEnd.json()).set.split_id).toBeNull()
    })

    it("bounds bulk deletes", async () => {
        const res = await DELETE(await apiRequest("/api/workouts/sets", { method: "DELETE", userId: alice, body: { ids: Array.from({ length: 201 }, () => alice) } }))
        expect(res.status).toBe(400)
    })
})
