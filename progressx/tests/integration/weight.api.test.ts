import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, useTestAuthEnv } from "../helpers/auth"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const { GET, PUT } = await import("@/app/api/weight/route")
const alice = "11111111-1111-4111-8111-111111111111"

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    fakeDb.seed("profiles", [{ id: alice, profile_privacy: "private", email: "zz-alice@example.com" }])
})

const save = async (body: unknown) => PUT(await apiRequest("/api/weight", { method: "PUT", userId: alice, body }))

describe("/api/weight", () => {
    it("keeps one morning and one night weight per day, replacing on re-entry", async () => {
        expect((await save({ date: "2026-10-01", period: "morning", weightKg: 80.123 })).status).toBe(200)
        await save({ date: "2026-10-01", period: "night", weightKg: 81 })
        await save({ date: "2026-10-01", period: "morning", weightKg: 79.5 })

        const res = await GET(await apiRequest("/api/weight?from=2026-10-01&to=2026-10-01", { userId: alice }))
        const body = await res.json()
        expect(body.weightUnit).toBe("lb")
        expect(body.entries.map((e: { period: string, weightKg: number }) => [e.period, e.weightKg])).toEqual([["morning", 79.5], ["night", 81]])
    })

    it("follows the unit in Settings", async () => {
        fakeDb.seed("user_settings", [{ user_id: alice, weight_unit: "kg" }])
        const res = await GET(await apiRequest("/api/weight?from=2026-10-01&to=2026-10-01", { userId: alice }))
        expect((await res.json()).weightUnit).toBe("kg")
    })

    it.each([
        [{ date: "2026-10-01", period: "noon", weightKg: 80 }],
        [{ date: "Oct 1", period: "morning", weightKg: 80 }],
        [{ date: "2026-10-01", period: "morning", weightKg: 5 }],
        [{ date: "2026-10-01", period: "morning", weightKg: "heavy" }],
    ])("rejects %j", async (body) => {
        expect((await save(body)).status).toBe(400)
        expect(fakeDb.rows("weight_log_entries")).toEqual([])
    })
})
