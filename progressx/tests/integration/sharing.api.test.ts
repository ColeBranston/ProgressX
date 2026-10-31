import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, params, useTestAuthEnv } from "../helpers/auth"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const alice = "11111111-1111-4111-8111-111111111111" // public: weight and diet to everyone, workouts to followers
const bob = "22222222-2222-4222-8222-222222222222"   // private: everything to everyone (so, to approved followers)
const carol = "33333333-3333-4333-8333-333333333333" // the viewer

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    fakeDb.seed("profiles", [
        { id: alice, display_username: "alice_lifts", display_name: "Alice", profile_privacy: "public", age: 30, gender: "female", height_cm: 165, weight_lbs: 140, activity_level: 3, followers_count: 0, following_count: 0, likes_count: 0 },
        { id: bob, display_username: "bob.b", display_name: "Bob", profile_privacy: "private", age: 40, gender: "male", height_cm: 180, weight_lbs: 190, activity_level: 2, followers_count: 0, following_count: 0, likes_count: 0 },
        { id: carol, display_username: "carol", display_name: "Carol", profile_privacy: "public", followers_count: 0, following_count: 0, likes_count: 0 },
    ])
    fakeDb.seed("user_settings", [
        { user_id: alice, photos_audience: "only_me", weight_audience: "everyone", workouts_audience: "followers", diet_audience: "everyone" },
        { user_id: bob, photos_audience: "everyone", weight_audience: "everyone", workouts_audience: "everyone", diet_audience: "everyone" },
        { user_id: carol, weight_unit: "kg" },
    ])
    fakeDb.seed("weight_log_entries", [
        { user_id: alice, log_date: "2026-10-20", period: "morning", weight_kg: 63.5 },
        { user_id: alice, log_date: "2026-10-27", period: "morning", weight_kg: 63.1 },
        { user_id: bob, log_date: "2026-10-27", period: "morning", weight_kg: 86 },
    ])
    fakeDb.seed("food_log_entries", [
        { id: "f1", user_id: alice, log_date: "2026-10-27", name: "Oats", serving_qty: 1, serving_unit: "cup", calories: 300, protein_g: 10, carbs_g: 54, fats_g: 5, created_at: "2026-10-27T08:00:00Z" },
    ])
    fakeDb.seed("diet_config", [{ id: alice, goal_state: "Deficit" }])
    fakeDb.seed("photo_collection", [{ id: "p1", user_id: alice, image_link: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg", description: null, created_at: "2026-10-01T00:00:00" }])
})

const getProfile = async (username: string, userId: string | null) => {
    const { GET } = await import("@/app/api/profiles/[username]/route")
    const res = await GET(await apiRequest(`/api/profiles/${username}`, { userId }), params({ username }))
    return (await res.json()).profile
}

const getTracking = async (username: string, kind: string, query: string, userId: string | null) => {
    const { GET } = await import("@/app/api/profiles/[username]/tracking/[kind]/route")
    return GET(await apiRequest(`/api/profiles/${username}/tracking/${kind}?${query}`, { userId }), params({ username, kind }))
}

describe("what a profile says it shares", () => {
    it("shows everyone's choices to anyone signed in, and followers' choices to followers", async () => {
        expect((await getProfile("alice_lifts", carol)).shared).toEqual({ photos: false, weight: true, workouts: false, diet: true })
        fakeDb.seed("follows", [{ follower_id: carol, following_id: alice }])
        expect((await getProfile("alice_lifts", carol)).shared).toEqual({ photos: false, weight: true, workouts: true, diet: true })
    })

    it("never shows anything to visitors who aren't signed in", async () => {
        expect((await getProfile("alice_lifts", null)).shared).toEqual({ photos: false, weight: false, workouts: false, diet: false })
    })

    it("shows a private profile's tracking only to the followers it approved, even when set to everyone", async () => {
        expect((await getProfile("bob.b", carol)).shared).toEqual({ photos: false, weight: false, workouts: false, diet: false })
        fakeDb.seed("follow_requests", [{ requester_id: carol, target_id: bob }])
        expect((await getProfile("bob.b", carol)).shared).toEqual({ photos: false, weight: false, workouts: false, diet: false })
        fakeDb.seed("follows", [{ follower_id: carol, following_id: bob }])
        expect((await getProfile("bob.b", carol)).shared).toEqual({ photos: true, weight: true, workouts: true, diet: true })
    })
})

describe("GET /api/profiles/:username/tracking/:kind", () => {
    it("needs a login", async () => {
        expect((await getTracking("alice_lifts", "weight", "from=2026-10-01&to=2026-10-28", null)).status).toBe(401)
    })

    it("refuses what isn't shared with this viewer, and everything on a private profile they don't follow", async () => {
        expect((await getTracking("alice_lifts", "photos", "", carol)).status).toBe(403)
        expect((await getTracking("alice_lifts", "workouts", "from=2026-10-01&to=2026-10-28", carol)).status).toBe(403)
        expect((await getTracking("bob.b", "weight", "from=2026-10-01&to=2026-10-28", carol)).status).toBe(403)
        expect((await getTracking("nobody_here", "weight", "from=2026-10-01&to=2026-10-28", carol)).status).toBe(404)
        expect((await getTracking("alice_lifts", "secrets", "", carol)).status).toBe(404)
    })

    it("returns shared weigh-ins in the range, with the viewer's own unit", async () => {
        const res = await getTracking("alice_lifts", "weight", "from=2026-10-21&to=2026-10-28", carol)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ entries: [{ date: "2026-10-27", period: "morning", weightKg: 63.1 }], weightUnit: "kg" })
    })

    it("returns a day's food with the targets their diet page uses, but not their body stats", async () => {
        const res = await getTracking("alice_lifts", "diet", "date=2026-10-27", carol)
        const json = await res.json()
        expect(json.entries).toEqual([{ id: "f1", name: "Oats", servingQty: 1, servingUnit: "cup", calories: 300, proteinG: 10, carbsG: 54, fatsG: 5 }])
        expect(json.targets).toMatchObject({ goal: "Deficit", calories: expect.any(Number), protein: expect.any(Number) })
        expect(JSON.stringify(json)).not.toMatch(/height|age|gender|weight_lbs/)
    })

    it("opens followers-only tracking to followers, and a private profile's to its approved followers", async () => {
        fakeDb.seed("follows", [{ follower_id: carol, following_id: alice }, { follower_id: carol, following_id: bob }])
        expect((await getTracking("alice_lifts", "workouts", "from=2026-10-01&to=2026-10-28", carol)).status).toBe(200)
        expect((await getTracking("alice_lifts", "photos", "", carol)).status).toBe(403) // only me
        expect((await getTracking("bob.b", "weight", "from=2026-10-01&to=2026-10-28", carol)).status).toBe(200)
    })

    it("lets people see all of their own, shared or not", async () => {
        expect((await getTracking("bob.b", "weight", "from=2026-10-01&to=2026-10-28", bob)).status).toBe(200)
        expect((await getTracking("alice_lifts", "photos", "", alice)).status).toBe(200)
    })
})

describe("saving what the profile shows", () => {
    it("changes only the choices sent in Settings, and rejects anything else", async () => {
        const { PATCH } = await import("@/app/api/user/settings/route")
        const res = await PATCH(await apiRequest("/api/user/settings", { method: "PATCH", userId: alice, body: { sharing: { photos: "followers", diet: "only_me" } } }))
        expect((await res.json()).settings.sharing).toEqual({ photos: "followers", weight: "everyone", workouts: "followers", diet: "only_me" })

        for (const sharing of [{ photos: true }, { photos: "public" }, { location: "everyone" }, ["everyone"]]) {
            const bad = await PATCH(await apiRequest("/api/user/settings", { method: "PATCH", userId: alice, body: { sharing } }))
            expect(bad.status).toBe(400)
        }
    })

    it("saves the privacy choices made in onboarding, only me unless chosen otherwise", async () => {
        const dana = "44444444-4444-4444-8444-444444444444"
        fakeDb.seed("profiles", [{ id: dana, profile_privacy: "private", isOnboarded: false }])
        const { POST } = await import("@/app/api/user/onboarding/route")
        const details = { username: "dana_d", name: "Dana", age: 28, gender: "female", heightCm: 170, weightLbs: 150, activity: 2 }

        const res = await POST(await apiRequest("/api/user/onboarding", { method: "POST", userId: dana, body: { ...details, privacy: "public", sharing: { workouts: "followers" } } }))
        expect(res.status).toBe(201)
        expect(fakeDb.rows("profiles").find((p) => p.id === dana)).toMatchObject({ profile_privacy: "public", isOnboarded: true })
        expect(fakeDb.rows("user_settings").find((s) => s.user_id === dana)).toMatchObject({ workouts_audience: "followers" })
        expect(fakeDb.rows("user_settings").find((s) => s.user_id === dana)?.diet_audience).toBeUndefined() // the column default: only_me

        const bad = await POST(await apiRequest("/api/user/onboarding", { method: "POST", userId: dana, body: { ...details, privacy: "everyone" } }))
        expect(bad.status).toBe(400)
    })
})
