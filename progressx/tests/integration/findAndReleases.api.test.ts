import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { apiRequest, useTestAuthEnv } from "../helpers/auth"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))
vi.mock("@aws-sdk/client-s3", async () => (await import("../helpers/fakeR2")).s3Module)
vi.mock("@aws-sdk/s3-request-presigner", async () => (await import("../helpers/fakeR2")).presignerModule)

const find = await import("@/app/api/find/route")
const releases = await import("@/app/api/releases/route")

const alice = "11111111-1111-4111-8111-111111111111" // public
const bob = "22222222-2222-4222-8222-222222222222"   // private
const carol = "33333333-3333-4333-8333-333333333333" // public, the viewer
const vid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.stubEnv("R2_ACCOUNT_ID", "a")
    vi.stubEnv("R2_ACCESS_KEY_ID", "k")
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "s")
    fakeDb.foreignKey("videos_user_id_fkey", "videos", "user_id", "profiles")
})

describe("GET /api/find?type=profiles", () => {
    // every search is from a different visitor, so the per-requester limit doesn't build up across tests
    let ip = 0
    const search = async (query: string, userId: string | null = carol) => {
        const req = await apiRequest(`/api/find?${query}`, { userId })
        req.headers.set("x-forwarded-for", `203.0.113.${++ip % 250}, 10.0.0.1`)
        return find.GET(req)
    }

    beforeEach(() => {
        fakeDb.seed("profiles", [
            { id: alice, display_username: "alice_lifts", display_name: "Alice Anderson", profile_privacy: "public", followers_count: 3, isOnboarded: true },
            { id: bob, display_username: "lifts_bob", display_name: "Bob", profile_privacy: "private", followers_count: 10, isOnboarded: true },
            { id: carol, display_username: "carol", display_name: "Carol Lifts", profile_privacy: "public", followers_count: 1, isOnboarded: true },
            { id: "x", display_username: null, display_name: "Lifts McGee", profile_privacy: "public", isOnboarded: true },
            { id: "y", display_username: "lifts", display_name: "Not done", profile_privacy: "public", isOnboarded: false },
            { id: "z", display_username: "lifts", display_name: "Exact", profile_privacy: "public", followers_count: 0, isOnboarded: true },
        ])
        fakeDb.seed("follows", [{ follower_id: carol, following_id: alice }])
    })

    it("ranks the exact username, then starts-with, then names, then the rest", async () => {
        const body = await (await search("type=profiles&q=Lifts")).json()
        expect(body.profiles.map((p: { username: string }) => p.username)).toEqual(["lifts", "lifts_bob", "carol", "alice_lifts"])
        expect(body.profiles[3]).toEqual({ username: "alice_lifts", name: "Alice Anderson", pfp: null, privacy: "public", followers: 3, isOwner: false, following: true, requested: false })
        expect(body.profiles[2]).toMatchObject({ isOwner: true })
        expect(body.nextCursor).toBeNull()
    })

    it("shows visitors only public profiles", async () => {
        const body = await (await search("type=profiles&q=lifts", null)).json()
        expect(body.profiles.map((p: { username: string }) => p.username)).toEqual(["lifts", "carol", "alice_lifts"])
        expect(body.profiles.every((p: { following: boolean }) => !p.following)).toBe(true)
    })

    it("matches % and _ literally", async () => {
        const body = await (await search("type=profiles&q=%25")).json()
        expect(body.profiles).toEqual([])
        expect((await (await search("type=profiles&q=e_l")).json()).profiles.map((p: { username: string }) => p.username)).toEqual(["alice_lifts"])
    })

    it("pages through results", async () => {
        fakeDb.seed("profiles", Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, display_username: `squat${String(i).padStart(2, "0")}`, profile_privacy: "public", isOnboarded: true })))
        const first = await (await search("type=profiles&q=squat")).json()
        expect(first.profiles).toHaveLength(20)
        expect(first.nextCursor).toBe("20")
        const second = await (await search("type=profiles&q=squat&cursor=20")).json()
        expect(second.profiles.map((p: { username: string }) => p.username)).toEqual(["squat20", "squat21", "squat22", "squat23", "squat24"])
    })

    it.each([
        ["type=profiles&q=x&cursor=-1", 400],
        ["type=profiles&q=x&cursor=601", 400],
        ["type=profiles&q=x&cursor=1.5", 400],
        ["type=people&q=x", 400],
    ])("refuses %s", async (query, status) => {
        expect((await search(query)).status).toBe(status)
    })

    it("answers an empty search with nothing", async () => {
        expect(await (await search("type=profiles&q=%20%20")).json()).toEqual({ profiles: [], nextCursor: null })
        expect(await (await search("q=")).json()).toEqual({ videos: [], nextCursor: null })
    })

    it("limits how fast one requester can search", async () => {
        const req = async () => {
            const r = await apiRequest("/api/find?type=profiles&q=alice", { userId: alice })
            return find.GET(r)
        }
        for (let i = 0; i < 60; i++) expect((await req()).status).toBe(200)
        expect((await req()).status).toBe(429)
    })

    it("reports errors", async () => {
        fakeDb.failOn("profiles")
        expect((await search("type=profiles&q=alice")).status).toBe(500)
    })
})

describe("GET /api/find?type=videos", () => {
    let ip = 100
    const search = async (query: string, userId: string | null = carol) => {
        const req = await apiRequest(`/api/find?${query}`, { userId })
        req.headers.set("cf-connecting-ip", `198.51.100.${++ip % 250}`)
        return find.GET(req)
    }
    const ids = (body: { videos: { id: string }[] }) => body.videos.map((v) => v.id)
    const video = (n: number, userId: string, caption: string, extra: Record<string, unknown> = {}) => ({
        id: vid(n), user_id: userId, object_key: `k${n}`, poster_key: null, caption, status: "ready", duration_s: 5, width: 1, height: 1, likes_count: 0, favourites_count: 0,
        created_at: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), ...extra,
    })

    beforeEach(() => {
        fakeDb.seed("profiles", [
            { id: alice, display_username: "alice_lifts", display_name: "Alice", profile_privacy: "public", isOnboarded: true },
            { id: bob, display_username: "bob.b", display_name: "Bob Squats", profile_privacy: "private", isOnboarded: true },
            { id: carol, display_username: "carol", display_name: "Carol", profile_privacy: "public", isOnboarded: true },
        ])
    })

    it("finds visible videos by caption or by who posted them, newest first", async () => {
        fakeDb.seed("videos", [
            video(1, alice, "Heavy squats today"),
            video(2, alice, "Bench"),
            video(3, bob, "Squats at home"),
            video(4, carol, "my squat form", { status: "uploading" }),
            video(5, carol, "Deadlift"),
        ])
        expect(ids(await (await search("q=squat")).json())).toEqual([vid(1)])
        expect(ids(await (await search("q=alice")).json())).toEqual([vid(2), vid(1)])
        // bob's own videos only show up for bob
        expect(ids(await (await search("q=bob squats", bob)).json())).toEqual([vid(3)])
        expect(ids(await (await search("q=bob squats")).json())).toEqual([])
        expect(ids(await (await search("q=dead", null)).json())).toEqual([vid(5)])
    })

    it("pages past private videos without losing any", async () => {
        const rows = []
        for (let n = 1; n <= 40; n++) rows.push(video(n, n % 4 === 0 ? bob : alice, `set ${n}`))
        fakeDb.seed("videos", rows)
        const seen: string[] = []
        let cursor: string | null = "0"
        while (cursor !== null) {
            const body: { videos: { id: string }[], nextCursor: string | null } = await (await search(`q=set&cursor=${cursor}`)).json()
            seen.push(...ids(body))
            cursor = body.nextCursor
        }
        expect(seen).toEqual(Array.from({ length: 40 }, (_, i) => 40 - i).filter((n) => n % 4 !== 0).map(vid))
    })

    it("reports errors", async () => {
        fakeDb.failOn("videos")
        expect((await search("q=squat")).status).toBe(500)
    })
})

describe("/api/releases", () => {
    const latest = async (userId: string | null = alice) => (await releases.GET(await apiRequest("/api/releases", { userId }))).json()
    const seen = async (body: unknown, userId: string | null = alice) => releases.POST(await apiRequest("/api/releases", { method: "POST", userId, body }))

    beforeEach(() => {
        fakeDb.seed("profiles", [{ id: alice, created_at: "2026-03-01 12:00:00" }])
        fakeDb.seed("releases", [
            { id: 1, title: "First", body: "Old", pr_number: 1, released_at: "2026-02-01T00:00:00Z" },
            { id: 2, title: "Videos", body: "## What's new\n- Upload videos", pr_number: 30, released_at: "2026-04-01T00:00:00Z" },
        ])
    })

    it("shows the newest release once, until it's seen", async () => {
        expect((await latest()).release).toMatchObject({ id: 2, title: "Videos", prNumber: 30, releasedAt: "2026-04-01T00:00:00Z" })
        expect(await (await seen({ seenId: 2 })).json()).toEqual({ ok: true })
        expect(await latest()).toEqual({ release: null })
    })

    it("never moves the seen release backwards", async () => {
        await seen({ seenId: 2 })
        await seen({ seenId: 1 })
        expect(fakeDb.rows("user_settings")).toEqual([expect.objectContaining({ user_id: alice, last_seen_release_id: 2 })])
    })

    it("doesn't show releases from before the account was made", async () => {
        fakeDb.setTable("profiles", [{ id: alice, created_at: "2026-05-01 00:00:00" }])
        expect(await latest()).toEqual({ release: null })
    })

    it("gives visitors no release", async () => {
        expect(await latest(null)).toEqual({ release: null })
    })

    it.each([[{ seenId: 0 }], [{ seenId: "2" }], [null]])("rejects %j", async (body) => {
        expect((await seen(body)).status).toBe(400)
    })

    it("requires a login to mark one seen", async () => {
        expect((await seen({ seenId: 2 }, null)).status).toBe(401)
    })

    it("refuses a release that doesn't exist", async () => {
        fakeDb.failOn("user_settings", "update", { code: "23503", message: "violates foreign key constraint" })
        expect((await seen({ seenId: 99 })).status).toBe(400)
    })

    it.each(["releases", "user_settings", "profiles"])("reports a failing %s query", async (table) => {
        fakeDb.failOn(table)
        expect((await releases.GET(await apiRequest("/api/releases", { userId: alice }))).status).toBe(500)
        if (table === "user_settings") expect((await seen({ seenId: 2 })).status).toBe(500)
    })

    it("reports a failing update", async () => {
        fakeDb.failOn("user_settings", "update")
        expect((await seen({ seenId: 2 })).status).toBe(500)
    })
})
