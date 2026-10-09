import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, params, useTestAuthEnv } from "../helpers/auth"

// One test per bug that was found and fixed, named after it, so it can't quietly come back.

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("videos", () => {
    it("names the foreign key when embedding the author (PGRST201: videos has two paths to profiles)", async () => {
        const { VIDEO_WITH_AUTHOR } = await import("@/app/api/libs/videos")
        expect(VIDEO_WITH_AUTHOR).toContain("profiles!videos_user_id_fkey!inner(")
        expect(VIDEO_WITH_AUTHOR).not.toMatch(/(^|[ ,])profiles\(/)
    })
})

describe("profiles", () => {
    beforeEach(() => fakeDb.seed("profiles", [
        { id: alice, display_username: "alice_lifts", profile_privacy: "public", followers_count: 3, following_count: 1, likes_count: 0 },
        { id: bob, display_username: "bob.b", profile_privacy: "private", followers_count: 0, following_count: 0, likes_count: 0 },
    ]))

    const getProfile = async (username: string) => {
        const { GET } = await import("@/app/api/profiles/[username]/route")
        return GET(await apiRequest(`/api/profiles/${username}`, { userId: bob }), params({ username }))
    }

    it("doesn't 500 on a stray % in the username (decoding twice threw URIError)", async () => {
        expect((await getProfile("%E0%A4%A")).status).toBe(404)
        expect((await getProfile("100%")).status).toBe(404)
    })

    it("reports 'you follow them' as youFollow, not a second 'following' key that overwrote the count", async () => {
        fakeDb.seed("follows", [{ follower_id: bob, following_id: alice }])
        const { profile } = await (await getProfile("alice_lifts")).json()
        expect(profile).toMatchObject({ following: 1, followers: 3, youFollow: true, followsYou: false })
    })

    it("treats _ in a username literally, not as a LIKE wildcard", async () => {
        expect((await getProfile("alice.lifts")).status).toBe(404)
        expect((await getProfile("ALICE_LIFTS")).status).toBe(200)
    })
})

describe("workouts", () => {
    it("rejects inherited object keys as exercise ids ('constructor' passed the `in` check)", async () => {
        const { isExerciseId } = await import("@/app/internal_components/mystats/exercises")
        expect(["constructor", "__proto__", "toString", "valueOf"].some(isExerciseId)).toBe(false)
        const { POST } = await import("@/app/api/workouts/sets/route")
        const res = await POST(await apiRequest("/api/workouts/sets", { method: "POST", userId: alice, body: { exerciseId: "constructor", performedOn: "2026-10-01", weightKg: 10, reps: 5 } }))
        expect(res.status).toBe(400)
    })
})

describe("diet assistant", () => {
    it("doesn't read sugars as carbs, or saturated fat as fat", async () => {
        const { statedNutrients } = await import("@/app/api/libs/dietAssistant")
        expect(statedNutrients("Sugars 12g, protein 3g")).not.toContain("carbs")
        expect(statedNutrients("Saturated fat 2g, protein 3g")).toContain("saturated(?:\\s+fat)?")
        expect(statedNutrients("Sugars 12g, Total Carbohydrate 20g")).toContain("carbs")
    })

    it("uses the user's own numbers without searching (it used to search the database anyway)", async () => {
        const { looksLikeNutritionFacts } = await import("@/app/api/libs/dietAssistant")
        expect(looksLikeNutritionFacts("my wrap was 450 cal, 35g protein")).toBe(true)
        expect(looksLikeNutritionFacts("log a chicken wrap")).toBe(false)
    })
})

describe("search engines", () => {
    it("publishes only https://progressx.ca URLs (Google flagged http:// duplicates without a canonical)", async () => {
        const { default: sitemap } = await import("@/app/sitemap")
        const { default: robots } = await import("@/app/robots")
        for (const entry of sitemap()) expect(entry.url).toMatch(/^https:\/\/progressx\.ca\//)
        expect(robots()).toMatchObject({ sitemap: "https://progressx.ca/sitemap.xml", host: "https://progressx.ca" })
    })

    it("gives the login page its own canonical URL", async () => {
        const { metadata } = await import("@/app/(secondary)/login/layout")
        expect(metadata.alternates?.canonical).toBe("/login")
    })
})

describe("ID verification", () => {
    it("refuses to delete an account whose ID files it can't reach, instead of orphaning them", async () => {
        vi.stubEnv("R2_ID_ACCESS_KEY_ID", "")
        fakeDb.seed("id_verifications", [{ user_id: alice, status: "verified" }])
        const { deleteUserIdDocuments } = await import("@/app/api/libs/accountData")
        await expect(deleteUserIdDocuments(alice)).rejects.toThrow("ID storage isn't configured")
        await expect(deleteUserIdDocuments(bob)).resolves.toBe(0) // nothing stored: nothing to lose
    })

    it("keeps fingerprints and wrapped keys out of the data export", async () => {
        fakeDb.seed("id_verifications", [{ user_id: alice, status: "verified", document_type: "passport", issuing_country: "CAN", expires_on: "2099-01-01", verified_at: "2026-10-08", fingerprint: "f".repeat(64), wrapped_key: "secret", object_keys: ["ids/a/front.bin"], key_version: 1 }])
        const { verificationSummary } = await import("@/app/api/libs/accountData")
        const summary = JSON.stringify(await verificationSummary(alice))
        expect(summary).not.toContain("f".repeat(64))
        expect(summary).not.toContain("secret")
        expect(summary).not.toContain("front.bin")
    })
})
