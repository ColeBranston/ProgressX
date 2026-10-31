import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, params, useTestAuthEnv } from "../helpers/auth"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const splits = await import("@/app/api/workouts/splits/route")
const split = await import("@/app/api/workouts/splits/[id]/route")
const sets = await import("@/app/api/workouts/sets/route")
const oneSet = await import("@/app/api/workouts/sets/[id]/route")

const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"
const missing = "99999999-9999-4999-8999-999999999999"
const days = [{ name: "Push", exercises: [{ exerciseId: "barbell-bench-press", sets: 4, reps: "5" }] }]

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
})

const create = async (body: unknown, userId: string | null = alice) => splits.POST(await apiRequest("/api/workouts/splits", { method: "POST", userId, body }))
const newSplit = async (name: string, userId = alice) => (await (await create({ name, days }, userId)).json()).split.id as string
const patch = async (id: string, body: unknown, userId: string | null = alice) =>
    split.PATCH(await apiRequest(`/api/workouts/splits/${id}`, { method: "PATCH", userId, body }), params({ id }))
const remove = async (id: string, userId: string | null = alice) =>
    split.DELETE(await apiRequest(`/api/workouts/splits/${id}`, { method: "DELETE", userId }), params({ id }))
const active = () => fakeDb.rows("workout_splits").filter((s) => s.is_active).map((s) => s.name)

describe("/api/workouts/splits", () => {
    it("requires a signed-in user", async () => {
        expect((await splits.GET(await apiRequest("/api/workouts/splits"))).status).toBe(401)
        expect((await create({ name: "PPL", days }, null)).status).toBe(401)
        expect((await patch(missing, {}, null)).status).toBe(401)
        expect((await remove(missing, null)).status).toBe(401)
    })

    it("makes the first split active and lists the active one first", async () => {
        const res = await create({ name: "  Upper/Lower ", days: [{ name: "Upper", exercises: [{ exerciseId: "barbell-bench-press", sets: 99 }] }] })
        expect(res.status).toBe(201)
        expect((await res.json()).split).toMatchObject({ name: "Upper/Lower", is_active: true, days: [{ name: "Upper", exercises: [{ exerciseId: "barbell-bench-press", sets: 10, reps: "8-12" }] }] })
        const second = await newSplit("PPL")
        await newSplit("Full body", bob)
        await patch(second, { isActive: true })

        const listed = await (await splits.GET(await apiRequest("/api/workouts/splits", { userId: alice }))).json()
        expect(listed.splits.map((s: { name: string }) => s.name)).toEqual(["PPL", "Upper/Lower"])
    })

    it.each([
        [{ name: "", days }, "name must be 1 to 60 characters"],
        [{ name: "x".repeat(61), days }, "name must be 1 to 60 characters"],
        [{ name: "PPL", days: [] }, /days must have 1 to/],
        [{ name: "PPL", days: [{ name: "", exercises: [] }] }, "day 1 needs a name"],
        [{ name: "PPL", days: [null] }, "day 1 is invalid"],
        [{ name: "PPL", days: [{ name: "Push", exercises: [{ exerciseId: "toString" }] }] }, "Push has an unknown exercise"],
        [{ name: "PPL", days: [{ name: "Push", exercises: "bench" }] }, /Push can have at most/],
    ])("rejects %j", async (body, message) => {
        const res = await create(body)
        expect(res.status).toBe(400)
        expect((await res.json()).message).toMatch(message)
        expect(fakeDb.rows("workout_splits")).toEqual([])
    })

    it("caps the number of splits", async () => {
        fakeDb.seed("workout_splits", Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, user_id: alice, name: `S${i}`, days, is_active: i === 0 })))
        const res = await create({ name: "One more", days })
        expect(res.status).toBe(400)
        expect((await res.json()).message).toBe("You can have up to 20 splits")
    })

    it("reports database errors", async () => {
        fakeDb.failOn("workout_splits", "select")
        expect((await splits.GET(await apiRequest("/api/workouts/splits", { userId: alice }))).status).toBe(500)
        expect((await create({ name: "PPL", days })).status).toBe(500)
        fakeDb.reset()
        fakeDb.failOn("workout_splits", "insert")
        expect((await create({ name: "PPL", days })).status).toBe(500)
    })
})

describe("/api/workouts/splits/[id]", () => {
    it("renames a split and replaces its days", async () => {
        const id = await newSplit("PPL")
        const res = await patch(id, { name: "Push Pull Legs", days: [{ name: "Legs", exercises: [] }] })
        expect(res.status).toBe(200)
        expect((await res.json()).split).toMatchObject({ id, name: "Push Pull Legs", days: [{ name: "Legs", exercises: [] }], is_active: true })
    })

    it("switches the active split", async () => {
        const first = await newSplit("A")
        const second = await newSplit("B")
        expect(active()).toEqual(["A"])
        await patch(second, { isActive: true })
        expect(active()).toEqual(["B"])
        await patch(first, { isActive: true })
        expect(active()).toEqual(["A"])
    })

    it.each([
        [{ name: " " }, "name must be 1 to 60 characters"],
        [{ days: "none" }, /days must have/],
        [{ isActive: false }, /isActive can only be set to true/],
    ])("rejects %j", async (body, message) => {
        const id = await newSplit("PPL")
        const res = await patch(id, body)
        expect(res.status).toBe(400)
        expect((await res.json()).message).toMatch(message)
    })

    it("rejects a body that isn't an object", async () => {
        const id = await newSplit("PPL")
        expect((await patch(id, "rename")).status).toBe(400)
    })

    it("can't see, edit or delete another user's split", async () => {
        const theirs = await newSplit("Bob's", bob)
        expect((await patch(theirs, { name: "Mine now" })).status).toBe(404)
        expect((await patch("not-a-uuid", { name: "x" })).status).toBe(404)
        expect((await remove(theirs)).status).toBe(404)
        expect((await remove("not-a-uuid")).status).toBe(404)
        expect(fakeDb.rows("workout_splits")).toEqual([expect.objectContaining({ id: theirs, name: "Bob's" })])
    })

    it("deletes a split", async () => {
        const id = await newSplit("PPL")
        const res = await remove(id)
        expect(await res.json()).toEqual({ message: "Workout split deleted" })
        expect(fakeDb.rows("workout_splits")).toEqual([])
    })

    it.each([["select"], ["update"]] as const)("reports a failing %s", async (op) => {
        const id = await newSplit("PPL")
        fakeDb.failOn("workout_splits", op)
        expect((await patch(id, { isActive: true })).status).toBe(500)
    })

    it("reports a failing final update", async () => {
        const id = await newSplit("PPL")
        fakeDb.failOn("workout_splits", "update")
        expect((await patch(id, { name: "New" })).status).toBe(500)
        fakeDb.failOn("workout_splits", "delete")
        expect((await remove(id)).status).toBe(500)
    })
})

describe("/api/workouts/sets/[id]", () => {
    const logSet = async (userId = alice) => {
        const res = await sets.POST(await apiRequest("/api/workouts/sets", { method: "POST", userId, body: { exerciseId: "barbell-bench-press", performedOn: "2026-10-01", weightKg: 100, reps: 5 } }))
        return (await res.json()).set.id as string
    }
    const edit = async (id: string, body: unknown, userId: string | null = alice) =>
        oneSet.PATCH(await apiRequest(`/api/workouts/sets/${id}`, { method: "PATCH", userId, body }), params({ id }))
    const drop = async (id: string, userId: string | null = alice) =>
        oneSet.DELETE(await apiRequest(`/api/workouts/sets/${id}`, { method: "DELETE", userId }), params({ id }))

    it("requires a signed-in user", async () => {
        expect((await edit(missing, { reps: 1 }, null)).status).toBe(401)
        expect((await drop(missing, null)).status).toBe(401)
    })

    it("edits the weight and reps of the user's own set", async () => {
        const id = await logSet()
        const res = await edit(id, { weightKg: 102.555, reps: 6 })
        expect((await res.json()).set).toMatchObject({ id, weight_kg: 102.56, reps: 6 })
    })

    it.each([
        [{ weightKg: -1 }, "weightKg must be 0 to 1000"],
        [{ reps: 2.5 }, "reps must be a whole number from 1 to 600"],
        [{}, "Nothing to update"],
        [null, "Nothing to update"],
    ])("rejects %j", async (body, message) => {
        const id = await logSet()
        const res = await edit(id, body)
        expect(res.status).toBe(400)
        expect((await res.json()).message).toBe(message)
    })

    it("can't edit or delete another user's set", async () => {
        const theirs = await logSet(bob)
        expect((await edit(theirs, { reps: 1 })).status).toBe(404)
        expect((await edit("nope", { reps: 1 })).status).toBe(404)
        expect((await drop(theirs)).status).toBe(404)
        expect((await drop("nope")).status).toBe(404)
        expect(fakeDb.rows("workout_sets")[0]).toMatchObject({ reps: 5 })
    })

    it("deletes a set", async () => {
        const id = await logSet()
        expect((await drop(id)).status).toBe(200)
        expect(fakeDb.rows("workout_sets")).toEqual([])
    })

    it("reports database errors", async () => {
        const id = await logSet()
        fakeDb.failOn("workout_sets")
        expect((await edit(id, { reps: 3 })).status).toBe(500)
        expect((await drop(id)).status).toBe(500)
    })
})
