import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, params, useTestAuthEnv } from "../helpers/auth"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const follow = await import("@/app/api/profiles/[username]/follow/route")

const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"

function verify(userId: string, expires_on = "2099-01-01") {
    fakeDb.seed("id_verifications", [{ user_id: userId, status: "verified", document_type: "passport", issuing_country: "CAN", expires_on, verified_at: new Date().toISOString(), rejection_reason: null }])
}

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    fakeDb.seed("profiles", [
        { id: alice, display_username: "alice_lifts", profile_privacy: "public", followers_count: 0 },
        { id: bob, display_username: "bob.b", profile_privacy: "private", followers_count: 0 },
    ])
    fakeDb.uniqueKey("follows", ["follower_id", "following_id"])
    // the follows_count trigger
    fakeDb.afterWrite("follows", (db) => {
        for (const profile of db.table("profiles")) profile.followers_count = db.table("follows").filter((f) => f.following_id === profile.id).length
    })
})

const put = async (as: string, username: string) => follow.PUT(await apiRequest(`/api/profiles/${username}/follow`, { method: "PUT", userId: as }), params({ username }))
const del = async (as: string, username: string) => follow.DELETE(await apiRequest(`/api/profiles/${username}/follow`, { method: "DELETE", userId: as }), params({ username }))

describe("following needs a verified ID", () => {
    it("refuses to follow without verification and explains how to fix it", async () => {
        const res = await put(alice, "bob.b")
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ code: "verification_required", message: "Verify your ID in Settings to follow people." })
        expect(fakeDb.rows("follows")).toEqual([])
    })

    it("treats an expired document as unverified", async () => {
        verify(alice, "2020-01-01")
        expect((await put(alice, "bob.b")).status).toBe(403)
    })

    it("always allows unfollowing, verified or not", async () => {
        fakeDb.seed("follows", [{ follower_id: alice, following_id: bob }])
        const res = await del(alice, "bob.b")
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ following: false, followers: 0 })
    })
})

describe("PUT/DELETE /api/profiles/:username/follow", () => {
    beforeEach(() => verify(alice))

    it("follows (even private profiles), idempotently, and returns the count", async () => {
        expect(await (await put(alice, "bob.b")).json()).toEqual({ following: true, followers: 1 })
        expect(await (await put(alice, "BOB.B")).json()).toEqual({ following: true, followers: 1 }) // usernames ignore case
        expect(fakeDb.rows("follows")).toHaveLength(1)
    })

    it("can't follow yourself, nobody, or a username with wildcards", async () => {
        expect((await put(alice, "me")).status).toBe(400)
        expect((await put(alice, "nobody_here")).status).toBe(404)
        expect((await put(alice, "bo%")).status).toBe(404)
        expect((await put(alice, "b_b.b")).status).toBe(404) // "_" isn't a LIKE wildcard
    })

    it("needs a session", async () => {
        const res = await follow.PUT(await apiRequest("/api/profiles/bob.b/follow", { method: "PUT" }), params({ username: "bob.b" }))
        expect(res.status).toBe(401)
    })
})
