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
    fakeDb.uniqueKey("follow_requests", ["requester_id", "target_id"])
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
        expect(await res.json()).toEqual({ following: false, requested: false, followers: 0 })
    })
})

describe("PUT/DELETE /api/profiles/:username/follow", () => {
    beforeEach(() => verify(alice))

    it("follows a public profile straight away, idempotently, and returns the count", async () => {
        verify(bob)
        expect(await (await put(bob, "alice_lifts")).json()).toEqual({ following: true, requested: false, followers: 1 })
        expect(await (await put(bob, "ALICE_LIFTS")).json()).toEqual({ following: true, requested: false, followers: 1 }) // usernames ignore case
        expect(fakeDb.rows("follows")).toHaveLength(1)
    })

    it("asks to follow a private profile instead, and taking it back removes the request", async () => {
        expect(await (await put(alice, "bob.b")).json()).toEqual({ following: false, requested: true, followers: 0 })
        expect(await (await put(alice, "bob.b")).json()).toEqual({ following: false, requested: true, followers: 0 })
        expect(fakeDb.rows("follows")).toEqual([])
        expect(fakeDb.rows("follow_requests")).toHaveLength(1)

        expect(await (await del(alice, "bob.b")).json()).toEqual({ following: false, requested: false, followers: 0 })
        expect(fakeDb.rows("follow_requests")).toEqual([])
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

describe("follow requests", () => {
    const requests = async (as: string) => (await import("@/app/api/user/follow-requests/route")).GET(await apiRequest("/api/user/follow-requests", { userId: as }))
    const answer = async (as: string, username: string, method: "PUT" | "DELETE") => {
        const route = await import("@/app/api/user/follow-requests/[username]/route")
        return route[method](await apiRequest(`/api/user/follow-requests/${username}`, { method, userId: as }), params({ username }))
    }

    beforeEach(async () => {
        verify(alice)
        await put(alice, "bob.b")
    })

    it("lists who is waiting, only to the profile's owner", async () => {
        expect((await (await requests(bob)).json()).requests).toEqual([expect.objectContaining({ username: "alice_lifts" })])
        expect((await (await requests(alice)).json()).requests).toEqual([])
    })

    it("accepting makes them a follower; declining just removes the request", async () => {
        expect(await (await answer(bob, "alice_lifts", "PUT")).json()).toEqual({ followers: 1 })
        expect(fakeDb.rows("follows")).toEqual([expect.objectContaining({ follower_id: alice, following_id: bob })])
        expect(fakeDb.rows("follow_requests")).toEqual([])
        expect((await answer(bob, "alice_lifts", "PUT")).status).toBe(404) // nothing left to accept

        await del(alice, "bob.b")
        await put(alice, "bob.b")
        expect(await (await answer(bob, "alice_lifts", "DELETE")).json()).toEqual({ followers: 0 })
        expect(fakeDb.rows("follows")).toEqual([])
        expect(fakeDb.rows("follow_requests")).toEqual([])
    })

    it("accepts everyone waiting when the profile goes public", async () => {
        const settings = await import("@/app/api/user/settings/route")
        await settings.PATCH(await apiRequest("/api/user/settings", { method: "PATCH", userId: bob, body: { profilePrivacy: "public" } }))
        expect(fakeDb.rows("follows")).toEqual([expect.objectContaining({ follower_id: alice, following_id: bob })])
        expect(fakeDb.rows("follow_requests")).toEqual([])
    })

    it("lets the owner remove a follower", async () => {
        await answer(bob, "alice_lifts", "PUT")
        const route = await import("@/app/api/user/followers/[username]/route")
        const res = await route.DELETE(await apiRequest("/api/user/followers/alice_lifts", { method: "DELETE", userId: bob }), params({ username: "alice_lifts" }))
        expect(await res.json()).toEqual({ followers: 0 })
        expect(fakeDb.rows("follows")).toEqual([])
    })
})

describe("a private profile's videos", () => {
    const listVideos = async (as: string | null) => (await import("@/app/api/videos/route")).GET(await apiRequest("/api/videos?user=bob.b", { userId: as }))
    const profile = async (as: string) => (await (await import("@/app/api/profiles/[username]/route")).GET(await apiRequest("/api/profiles/bob.b", { userId: as }), params({ username: "bob.b" }))).json()

    it("are for the followers it approved", async () => {
        verify(alice)
        expect((await listVideos(alice)).status).toBe(403)
        expect((await profile(alice)).profile).toMatchObject({ canSee: false, listsVisible: false, youFollow: false, requested: false })

        await put(alice, "bob.b")
        expect((await profile(alice)).profile).toMatchObject({ canSee: false, requested: true })
        expect((await listVideos(alice)).status).toBe(403)

        fakeDb.seed("follows", [{ follower_id: alice, following_id: bob }]) // accepted
        expect((await listVideos(alice)).status).toBe(200)
        expect((await profile(alice)).profile).toMatchObject({ canSee: true, listsVisible: true, youFollow: true })
        expect((await listVideos(null)).status).toBe(404)
    })
})
