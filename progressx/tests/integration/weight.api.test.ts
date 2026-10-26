import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, useTestAuthEnv } from "../helpers/auth"
import { LB_PER_KG } from "@/app/internal_components/profile/profileRules"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const { GET, PUT, DELETE } = await import("@/app/api/weight/route")
const alice = "11111111-1111-4111-8111-111111111111"

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    fakeDb.seed("profiles", [{ id: alice, profile_privacy: "private", email: "zz-alice@example.com" }])
})

const save = async (body: unknown) => PUT(await apiRequest("/api/weight", { method: "PUT", userId: alice, body }))
const profileWeight = () => fakeDb.rows("profiles").find((p) => p.id === alice)?.weight_lbs

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

    it("sets the profile weight to the average of the last 10 morning weigh-ins", async () => {
        // 12 mornings at 70..81 kg; only the latest 10 (72..81, average 76.5 kg) count
        for (let day = 1; day <= 12; day++) {
            await save({ date: `2026-10-${String(day).padStart(2, "0")}`, period: "morning", weightKg: 69 + day })
        }
        await save({ date: "2026-10-12", period: "night", weightKg: 120 })
        expect(profileWeight()).toBe(Math.round(76.5 * LB_PER_KG))

        // back-filling an older morning outside the latest 10 leaves it unchanged
        await save({ date: "2026-09-01", period: "morning", weightKg: 150 })
        expect(profileWeight()).toBe(Math.round(76.5 * LB_PER_KG))

        // deleting a morning pulls the next older one into the average (now 71..80, average 75.5 kg)
        await DELETE(await apiRequest("/api/weight?date=2026-10-12&period=morning", { method: "DELETE", userId: alice }))
        expect(profileWeight()).toBe(Math.round(75.5 * LB_PER_KG))
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

    it("reports it when the profile weight couldn't be updated, and a retry fixes it", async () => {
        const from = fakeDb.from.bind(fakeDb)
        const broken = vi.spyOn(fakeDb, "from").mockImplementation((table: string) => table === "profiles"
            ? ({ update: () => ({ eq: async () => ({ error: { message: "connection reset" } }) }) }) as unknown as ReturnType<typeof from>
            : from(table))

        const res = await save({ date: "2026-10-05", period: "morning", weightKg: 80 })
        expect(res.status).toBe(500)
        expect(await res.json()).toMatchObject({ code: "profile_weight_not_updated" })
        expect(profileWeight()).toBeUndefined()

        broken.mockRestore()
        expect((await save({ date: "2026-10-05", period: "morning", weightKg: 80 })).status).toBe(200)
        expect(profileWeight()).toBe(Math.round(80 * LB_PER_KG))
    })
})
