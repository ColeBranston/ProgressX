import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../../helpers/fakeSupabase"
import { apiRequest, params, useTestAuthEnv } from "../../helpers/auth"
import { isPublicPage } from "@/app/api/libs/publicPages"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))

const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    fakeDb.seed("profiles", [
        { id: alice, display_username: "alice_lifts", display_name: "Alice", profile_privacy: "public", followers_count: 3, following_count: 1, likes_count: 2 },
        { id: bob, display_username: "bob.b", display_name: "Bob", profile_privacy: "private", followers_count: 0, following_count: 0, likes_count: 0 },
    ])
})

describe("which pages need an account", () => {
    it("lets anyone browse the public feed, search, research and other people's profiles", () => {
        for (const path of ["/explore", "/search", "/research", "/research/creatine", "/research/doc/abc", "/profile/alice_lifts"]) {
            expect(isPublicPage(path)).toBe(true)
        }
    })

    it("sends visitors to the login page everywhere else, including their own profile", () => {
        for (const path of ["/", "/following", "/upload", "/mystats", "/mystats/weight", "/mydiet", "/settings", "/profile", "/profile/alice/extra", "/explorer"]) {
            expect(isPublicPage(path)).toBe(false)
        }
    })
})

describe("profiles for visitors who aren't signed in", () => {
    const getProfile = async (username: string, userId: string | null = null) => {
        const { GET } = await import("@/app/api/profiles/[username]/route")
        return GET(await apiRequest(`/api/profiles/${username}`, { userId }), params({ username }))
    }

    it("shows a public profile, with nothing about the viewer", async () => {
        const res = await getProfile("alice_lifts")
        expect(res.status).toBe(200)
        expect((await res.json()).profile).toMatchObject({ username: "alice_lifts", name: "Alice", privacy: "public", isOwner: false, youFollow: false, followsYou: false })
    })

    it("treats a private profile as missing, while signed-in users still see its basics", async () => {
        expect((await getProfile("bob.b")).status).toBe(404)
        const signedIn = await getProfile("bob.b", alice)
        expect(signedIn.status).toBe(200)
        expect((await signedIn.json()).profile).toMatchObject({ username: "bob.b", privacy: "private" })
    })
})

describe("what still needs a login", () => {
    it("refuses your own video lists and 'me' without an account", async () => {
        const { GET } = await import("@/app/api/videos/route")
        expect((await GET(await apiRequest("/api/videos?user=me"))).status).toBe(401)
        expect((await GET(await apiRequest("/api/videos?user=alice_lifts&tab=liked"))).status).toBe(401)
    })

    it("hides a private profile's videos and follow lists as if it didn't exist", async () => {
        const videos = await import("@/app/api/videos/route")
        expect((await videos.GET(await apiRequest("/api/videos?user=bob.b"))).status).toBe(404)
        const lists = await import("@/app/api/profiles/[username]/[list]/route")
        expect((await lists.GET(await apiRequest("/api/profiles/bob.b/followers"), params({ username: "bob.b", list: "followers" }))).status).toBe(404)
        expect((await lists.GET(await apiRequest("/api/profiles/me/followers"), params({ username: "me", list: "followers" }))).status).toBe(401)
    })

    it("has no release notes for visitors, rather than an error", async () => {
        const { GET } = await import("@/app/api/releases/route")
        const res = await GET(await apiRequest("/api/releases"))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ release: null })
    })
})
