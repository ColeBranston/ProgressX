import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { fakeR2 } from "../helpers/fakeR2"
import { apiRequest, params, useTestAuthEnv } from "../helpers/auth"
import { encodeCursor } from "@/app/api/libs/videos"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))
vi.mock("@aws-sdk/client-s3", async () => (await import("../helpers/fakeR2")).s3Module)
vi.mock("@aws-sdk/s3-request-presigner", async () => (await import("../helpers/fakeR2")).presignerModule)

const videos = await import("@/app/api/videos/route")
const feed = await import("@/app/api/videos/feed/route")
const following = await import("@/app/api/videos/following/route")
const video = await import("@/app/api/videos/[id]/route")
const reaction = await import("@/app/api/videos/[id]/[reaction]/route")
const complete = await import("@/app/api/videos/[id]/complete/route")
const upload = await import("@/app/api/videos/upload/route")

const BUCKET = "progressx-videos"
const alice = "11111111-1111-4111-8111-111111111111" // public
const bob = "22222222-2222-4222-8222-222222222222"   // private
const carol = "33333333-3333-4333-8333-333333333333" // public, the usual viewer

// video ids sort in the order they're numbered
const vid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

function seedVideo(n: number, userId: string, extra: Record<string, unknown> = {}) {
    const id = vid(n)
    const row = {
        id, user_id: userId, object_key: `videos/${userId}/${id}.mp4`, poster_key: `videos/${userId}/${id}.jpg`, caption: `video ${n}`, status: "ready",
        duration_s: "12.5", width: 1080, height: 1920, likes_count: 0, favourites_count: 0, created_at: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), ...extra,
    }
    fakeDb.seed("videos", [row])
    fakeR2.put(BUCKET, row.object_key, "mp4")
    return id
}

const verify = (userId: string) => fakeDb.seed("id_verifications", [{ user_id: userId, status: "verified", document_type: "passport", issuing_country: "CAN", expires_on: "2099-01-01", verified_at: "2026-01-01" }])

beforeEach(() => {
    fakeDb.reset()
    fakeR2.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.stubEnv("R2_ACCOUNT_ID", "test-account")
    vi.stubEnv("R2_ACCESS_KEY_ID", "key")
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret")
    vi.stubEnv("MEDIA_BASE_URL", "")
    vi.stubEnv("MEDIA_SIGNING_KEY", "")
    vi.stubEnv("AD_VIDEO_TAG_URL", "")
    fakeDb.seed("profiles", [
        { id: alice, display_username: "alice_lifts", display_name: "Alice", profile_image: "https://img/alice.jpg", profile_privacy: "public" },
        { id: bob, display_username: "bob.b", display_name: "Bob", profile_image: null, profile_privacy: "private" },
        { id: carol, display_username: "carol", display_name: "Carol", profile_image: null, profile_privacy: "public" },
    ])
    fakeDb.foreignKey("videos_user_id_fkey", "videos", "user_id", "profiles")
    fakeDb.foreignKey("video_likes_video_id_fkey", "video_likes", "video_id", "videos")
    fakeDb.foreignKey("video_favourites_video_id_fkey", "video_favourites", "video_id", "videos")
    fakeDb.uniqueKey("video_likes", ["user_id", "video_id"])
    fakeDb.uniqueKey("video_favourites", ["user_id", "video_id"])
    // the like / favourite count triggers
    for (const [table, column] of [["video_likes", "likes_count"], ["video_favourites", "favourites_count"]]) {
        fakeDb.afterWrite(table, (db) => {
            for (const row of db.table("videos")) row[column] = db.table(table).filter((r) => r.video_id === row.id).length
        })
    }
})

type Card = { id: string, caption: string, status: string, isOwner: boolean, liked: boolean, favourited: boolean, likes: number, author: { username: string, following: boolean }, playback: { src: string, poster: string | null } | null }

const list = async (query: string, userId: string | null = carol) => videos.GET(await apiRequest(`/api/videos?${query}`, { userId }))
const ids = (cards: Card[]) => cards.map((c) => c.id)

describe("GET /api/videos", () => {
    it("needs a login for your own videos and lists", async () => {
        expect((await list("user=me", null)).status).toBe(401)
        expect((await list("user=alice_lifts&tab=liked", null)).status).toBe(401)
    })

    it.each([
        ["user=me&cursor=garbage", 400],
        ["user=me&tab=drafts", 400],
        ["user=alice_lifts&tab=liked", 403],
        ["user=nobody_here", 404],
        ["user=x", 404],
    ])("refuses %s", async (query, status) => {
        expect((await list(query)).status).toBe(status)
    })

    it("lists a public profile's ready videos for anyone, newest first", async () => {
        seedVideo(1, alice)
        seedVideo(2, alice, { status: "uploading" })
        seedVideo(3, alice)
        seedVideo(4, bob)
        const res = await list("user=alice_lifts", null)
        const body = await res.json()
        expect(ids(body.videos)).toEqual([vid(3), vid(1)])
        expect(body.nextCursor).toBeNull()
        expect(body.videos[0]).toMatchObject({
            caption: "video 3", durationS: 12.5, isOwner: false, liked: false,
            author: { username: "alice_lifts", name: "Alice", pfp: "https://img/alice.jpg", following: false },
            playback: { src: expect.stringContaining(`/${BUCKET}/videos/${alice}/${vid(3)}.mp4?op=GetObjectCommand`), poster: expect.stringContaining(".jpg") },
        })
    })

    it("hides a private profile's videos from everyone but its owner", async () => {
        seedVideo(1, bob)
        expect(await (await list("user=bob.b")).json()).toEqual({ private: true, videos: [], nextCursor: null })
        expect((await list("user=bob.b")).status).toBe(403)
        expect((await list("user=bob.b", null)).status).toBe(404)
        expect(ids((await (await list("user=bob.b", bob)).json()).videos)).toEqual([vid(1)])
    })

    it("lists your own videos, unfinished ones too, and clears abandoned uploads", async () => {
        seedVideo(1, carol)
        seedVideo(2, carol, { status: "uploading", poster_key: null, created_at: new Date().toISOString() })
        seedVideo(3, carol, { status: "uploading", poster_key: null, created_at: "2026-01-01T00:00:00Z" })
        const body = await (await list("user=me")).json()
        expect(ids(body.videos)).toEqual([vid(2), vid(1)])
        expect(body.videos[0]).toMatchObject({ status: "uploading", isOwner: true, playback: null })
        expect(fakeDb.rows("videos").map((v) => v.id)).not.toContain(vid(3))
        expect(fakeR2.get(BUCKET, `videos/${carol}/${vid(3)}.mp4`)).toBeNull()
    })

    it("keeps an abandoned upload listed when it can't be cleared", async () => {
        seedVideo(1, carol, { status: "uploading", created_at: "2026-01-01T00:00:00Z" })
        fakeR2.failures.set("DeleteObjectsCommand", new Error("R2 down"))
        expect(ids((await (await list("user=me")).json()).videos)).toEqual([vid(1)])
    })

    it("pages through with a cursor", async () => {
        for (let n = 1; n <= 14; n++) seedVideo(n, alice)
        const first = await (await list("user=alice_lifts")).json()
        expect(first.videos).toHaveLength(12)
        expect(first.nextCursor).toBe(encodeCursor({ created_at: fakeDb.rows("videos").find((v) => v.id === vid(3))!.created_at as string, id: vid(3) }))
        const second = await (await list(`user=alice_lifts&cursor=${first.nextCursor}`)).json()
        expect(ids(second.videos)).toEqual([vid(2), vid(1)])
        expect(second.nextCursor).toBeNull()
    })

    it("signs playback through the media Worker when it's set up", async () => {
        vi.stubEnv("MEDIA_BASE_URL", "https://media.example.com/")
        vi.stubEnv("MEDIA_SIGNING_KEY", "k")
        seedVideo(1, alice, { poster_key: null })
        const [card] = (await (await list("user=alice_lifts")).json()).videos
        expect(card.playback).toEqual({ src: expect.stringMatching(new RegExp(`^https://media\\.example\\.com/videos/${alice}/${vid(1)}\\.mp4\\?exp=\\d+&sig=[\\w-]+$`)), poster: null })
    })

    it("lists your liked and favourited videos, newest reaction first, hiding ones gone private", async () => {
        seedVideo(1, alice)
        seedVideo(2, alice)
        seedVideo(3, bob)
        fakeDb.seed("video_likes", [
            { user_id: carol, video_id: vid(1), created_at: "2026-10-03" },
            { user_id: carol, video_id: vid(2), created_at: "2026-10-05" },
            { user_id: carol, video_id: vid(3), created_at: "2026-10-04" },
        ])
        fakeDb.seed("video_favourites", [{ user_id: carol, video_id: vid(1), created_at: "2026-10-03" }])
        const liked = await (await list("tab=liked")).json()
        expect(ids(liked.videos)).toEqual([vid(2), vid(1)])
        expect(liked.videos.every((c: Card) => c.liked)).toBe(true)
        expect(liked.videos[1].favourited).toBe(true)
        const favourites = await (await list("tab=favourites")).json()
        expect(ids(favourites.videos)).toEqual([vid(1)])
    })

    it("pages through likes", async () => {
        for (let n = 1; n <= 13; n++) {
            seedVideo(n, alice)
            fakeDb.seed("video_likes", [{ user_id: carol, video_id: vid(n), created_at: `2026-10-${String(n).padStart(2, "0")}` }])
        }
        const first = await (await list("tab=liked")).json()
        expect(first.videos).toHaveLength(12)
        const second = await (await list(`tab=liked&cursor=${first.nextCursor}`)).json()
        expect(ids(second.videos)).toEqual([vid(1)])
    })

    it("reports errors", async () => {
        fakeDb.failOn("videos")
        expect((await list("user=me")).status).toBe(500)
        fakeDb.failOn("video_likes")
        expect((await list("tab=liked")).status).toBe(500)
    })
})

describe("GET /api/videos/feed", () => {
    const load = async (query = "", userId: string | null = carol) => feed.GET(await apiRequest(`/api/videos/feed?${query}`, { userId }))

    it("deals out public, ready videos it hasn't shown yet", async () => {
        for (let n = 1; n <= 7; n++) seedVideo(n, alice)
        seedVideo(8, bob)
        seedVideo(9, alice, { status: "processing" })
        const seen = [vid(1), vid(2), "not-a-uuid"].join(",")
        const body = await (await load(`seen=${seen}`, null)).json()
        expect(body.videos).toHaveLength(5)
        expect(ids(body.videos).sort((a, b) => a.localeCompare(b))).toEqual([3, 4, 5, 6, 7].map(vid))
        expect(body.ads).toBeNull()
    })

    it("puts a shared video first when the viewer may see it", async () => {
        for (let n = 1; n <= 3; n++) seedVideo(n, alice)
        seedVideo(4, bob)
        expect(ids((await (await load(`start=${vid(2)}`)).json()).videos)[0]).toBe(vid(2))
        expect(ids((await (await load(`start=${vid(4)}`)).json()).videos)).not.toContain(vid(4))
        expect(ids((await (await load(`start=${vid(4)}`, bob)).json()).videos)).toContain(vid(4))
    })

    it("marks what the viewer liked, and who they follow", async () => {
        seedVideo(1, alice)
        fakeDb.seed("video_likes", [{ user_id: carol, video_id: vid(1) }])
        fakeDb.seed("follows", [{ follower_id: carol, following_id: alice }])
        const [card] = (await (await load()).json()).videos
        expect(card).toMatchObject({ liked: true, favourited: false, author: { following: true } })
    })

    it("includes the ad settings, personalized only for viewers who opted in", async () => {
        vi.stubEnv("AD_VIDEO_TAG_URL", "https://ads.example.com/vast?x=1")
        vi.stubEnv("AD_EVERY", "8")
        fakeDb.seed("user_settings", [{ user_id: carol, personalized_ads: true }])
        expect((await (await load()).json()).ads).toEqual({ tagUrl: "https://ads.example.com/vast?x=1", firstAfter: 4, every: 8, minGapSeconds: 45, personalized: true })
        expect((await (await load("", null)).json()).ads.personalized).toBe(false)
        fakeDb.failOn("user_settings")
        expect((await (await load()).json()).ads.personalized).toBe(false)
    })

    it("reports errors", async () => {
        seedVideo(1, alice)
        fakeDb.failOn("video_likes")
        expect((await load()).status).toBe(500)
        fakeDb.failOn("videos")
        expect((await load()).status).toBe(500)
    })
})

describe("GET /api/videos/following", () => {
    const load = async (query = "", userId: string | null = carol) => following.GET(await apiRequest(`/api/videos/following?${query}`, { userId }))

    it("requires a signed-in user and a valid cursor", async () => {
        expect((await load("", null)).status).toBe(401)
        expect((await load("cursor=%%%")).status).toBe(400)
    })

    it("says when you don't follow anyone", async () => {
        expect(await (await load()).json()).toEqual({ videos: [], nextCursor: null, followsAnyone: false })
    })

    it("lists the ready videos of people you follow, private profiles included, newest first, in pages", async () => {
        fakeDb.seed("follows", [{ follower_id: carol, following_id: alice }, { follower_id: carol, following_id: bob }])
        for (let n = 1; n <= 9; n++) seedVideo(n, alice)
        seedVideo(10, alice, { status: "uploading" })
        seedVideo(11, bob)
        seedVideo(12, carol)
        const first = await (await load()).json()
        // bob is private, but carol is an approved follower, so his video is in her feed
        expect(ids(first.videos)).toEqual([11, 9, 8, 7, 6, 5, 4, 3].map(vid))
        expect(first).toMatchObject({ followsAnyone: true, ads: null })
        expect(first.videos[0].author.following).toBe(true)
        const second = await (await load(`cursor=${first.nextCursor}`)).json()
        expect(ids(second.videos)).toEqual([vid(2), vid(1)])
        expect(second.nextCursor).toBeNull()
    })

    it("reports errors", async () => {
        fakeDb.failOn("follows")
        expect((await load()).status).toBe(500)
    })
})

describe("/api/videos/[id]", () => {
    const patch = async (id: string, body: unknown, userId: string | null = alice) => video.PATCH(await apiRequest(`/api/videos/${id}`, { method: "PATCH", userId, body }), params({ id }))
    const remove = async (id: string, userId: string | null = alice) => video.DELETE(await apiRequest(`/api/videos/${id}`, { method: "DELETE", userId }), params({ id }))

    it("only lets the owner edit or delete", async () => {
        const id = seedVideo(1, alice)
        expect((await patch(id, { caption: "x" }, null)).status).toBe(401)
        expect((await patch(id, { caption: "x" }, carol)).status).toBe(404)
        expect((await remove(id, carol)).status).toBe(404)
        expect((await remove("nope")).status).toBe(404)
        expect(fakeDb.rows("videos")).toHaveLength(1)
    })

    it("edits the caption as plain text", async () => {
        const id = seedVideo(1, alice)
        const res = await patch(id, { caption: "  Leg day\u0007\n\n\n\nPR!  " })
        expect(await res.json()).toEqual({ caption: "Leg day\n\nPR!" })
        expect(fakeDb.rows("videos")[0].caption).toBe("Leg day\n\nPR!")
        expect((await patch(id, { caption: "x".repeat(301) })).status).toBe(400)
        expect((await patch(id, { caption: 5 })).status).toBe(400)
    })

    it("deletes the files, then the video", async () => {
        const id = seedVideo(1, alice)
        fakeR2.put(BUCKET, `videos/${alice}/${id}.jpg`, "jpg")
        expect(await (await remove(id)).json()).toEqual({ message: "Deleted" })
        expect(fakeR2.keys(BUCKET)).toEqual([])
        expect(fakeDb.rows("videos")).toEqual([])
    })

    it("keeps the video when its files can't be deleted", async () => {
        const id = seedVideo(1, alice)
        fakeR2.failures.set("DeleteObjectsCommand", new Error("R2 down"))
        expect((await remove(id)).status).toBe(502)
        expect(fakeDb.rows("videos")).toHaveLength(1)
    })

    it("reports database errors", async () => {
        const id = seedVideo(1, alice)
        fakeDb.failOn("videos", "update")
        expect((await patch(id, { caption: "x" })).status).toBe(500)
        fakeDb.failOn("videos", "delete")
        expect((await remove(id)).status).toBe(500)
        fakeDb.failOn("videos", "select")
        expect((await patch(id, { caption: "x" })).status).toBe(500)
    })
})

describe("/api/videos/[id]/[reaction]", () => {
    const react = async (method: "PUT" | "DELETE", id: string, kind = "like", userId: string | null = carol) =>
        reaction[method](await apiRequest(`/api/videos/${id}/${kind}`, { method, userId }), params({ id, reaction: kind }))

    it("needs a login and a verified ID to react", async () => {
        const id = seedVideo(1, alice)
        expect((await react("PUT", id, "like", null)).status).toBe(401)
        const res = await react("PUT", id)
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ code: "verification_required", message: "Verify your ID in Settings to like videos." })
        expect((await (await react("PUT", id, "favourite")).json()).message).toBe("Verify your ID in Settings to save favourites.")
    })

    it("likes and favourites once, and takes them back", async () => {
        verify(carol)
        const id = seedVideo(1, alice)
        await react("PUT", id)
        expect(await (await react("PUT", id)).json()).toEqual({ likes: 1, favourites: 0, liked: true, favourited: false })
        expect(await (await react("PUT", id, "favourite")).json()).toEqual({ likes: 1, favourites: 1, liked: true, favourited: true })
        expect(await (await react("DELETE", id)).json()).toEqual({ likes: 0, favourites: 1, liked: false, favourited: true })
    })

    it("only reacts to videos the user can see", async () => {
        verify(carol)
        const hidden = seedVideo(1, bob)
        const unfinished = seedVideo(2, alice, { status: "uploading" })
        expect((await react("PUT", hidden)).status).toBe(404)
        expect((await react("PUT", unfinished)).status).toBe(404)
        expect((await react("PUT", "nope")).status).toBe(404)
        expect((await react("PUT", vid(9))).status).toBe(404)
        expect((await react("PUT", hidden, "share")).status).toBe(404)
        // a like can still be taken back after the poster goes private
        fakeDb.seed("video_likes", [{ user_id: carol, video_id: hidden }])
        expect(await (await react("DELETE", hidden)).json()).toMatchObject({ liked: false })
    })

    it("reports database errors", async () => {
        verify(carol)
        const id = seedVideo(1, alice)
        fakeDb.failOn("video_likes", "upsert")
        expect((await react("PUT", id)).status).toBe(500)
        fakeDb.failOn("videos")
        expect((await react("DELETE", id)).status).toBe(500)
    })
})

// A minimal MP4: an ftyp box, then a moov box holding a version 0 mvhd with the length
function mp4(seconds: number, brand = "isom") {
    const ftyp = Buffer.alloc(16)
    ftyp.writeUInt32BE(16, 0)
    ftyp.write("ftyp", 4)
    ftyp.write(brand, 8)
    const mvhd = Buffer.alloc(108)
    mvhd.writeUInt32BE(108, 0)
    mvhd.write("mvhd", 4)
    mvhd.writeUInt32BE(1000, 20)
    mvhd.writeUInt32BE(Math.round(seconds * 1000), 24)
    const moov = Buffer.alloc(8)
    moov.writeUInt32BE(8 + mvhd.length, 0)
    moov.write("moov", 4)
    return Buffer.concat([ftyp, moov, mvhd])
}

describe("POST /api/videos/[id]/complete", () => {
    const finish = async (id: string, body: unknown = {}, userId: string | null = alice) =>
        complete.POST(await apiRequest(`/api/videos/${id}/complete`, { method: "POST", userId, body }), params({ id }))
    const uploading = (n: number, file: Buffer | null) => {
        const id = seedVideo(n, alice, { status: "uploading", poster_key: null, duration_s: null, object_key: `videos/${alice}/${vid(n)}.mp4` })
        fakeR2.bucket(BUCKET).delete(`videos/${alice}/${id}.mp4`)
        if (file) fakeR2.put(BUCKET, `videos/${alice}/${id}.mp4`, file)
        return id
    }

    it("only finishes the owner's own videos", async () => {
        const id = uploading(1, mp4(10))
        expect((await finish(id, {}, null)).status).toBe(401)
        expect((await finish(id, {}, carol)).status).toBe(404)
        expect((await finish("nope")).status).toBe(404)
    })

    it("checks what arrived, stores a clean poster and marks the video ready", async () => {
        const id = uploading(1, mp4(42.123, "qt  "))
        const png = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#123" } }).png().toBuffer()
        const res = await finish(id, { poster: `data:image/png;base64,${png.toString("base64")}`, width: 1280, height: 99999 })
        expect(res.status).toBe(200)
        expect((await res.json()).video).toMatchObject({ id, status: "ready", durationS: 42.12, width: 1280, height: null, playback: { poster: expect.stringContaining(".jpg") } })
        expect(fakeDb.rows("videos")[0]).toMatchObject({ status: "ready", content_type: "video/quicktime", size_bytes: 132, poster_key: `videos/${alice}/${id}.jpg` })
        const poster = fakeR2.get(BUCKET, `videos/${alice}/${id}.jpg`)!
        expect([...poster.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
        expect((await sharp(poster).metadata()).width).toBe(720)

        // finishing again just returns it
        expect((await (await finish(id)).json()).video.status).toBe("ready")
    })

    it("skips a poster that isn't an image", async () => {
        const id = uploading(1, mp4(5))
        const res = await finish(id, { poster: `data:image/jpeg;base64,${Buffer.from("<svg/>").toString("base64")}` })
        expect((await res.json()).video.playback.poster).toBeNull()
        expect(fakeDb.rows("videos")[0].poster_key).toBeNull()
    })

    it.each([
        ["nothing arrived", null, 410],
        ["it isn't a video", Buffer.from("GIF89a".padEnd(64, "\0")), 415],
        ["it's too long", mp4(200), 400],
        ["it can't be read", mp4(5).subarray(0, 30), 422],
    ])("deletes the upload when %s", async (_case, file, status) => {
        const id = uploading(1, file)
        expect((await finish(id)).status).toBe(status)
        expect(fakeDb.rows("videos")).toEqual([])
        expect(fakeR2.keys(BUCKET)).toEqual([])
    })

    it("says to try again when storage fails", async () => {
        const id = uploading(1, mp4(5))
        fakeR2.failures.set("HeadObjectCommand", new Error("R2 down"))
        expect((await finish(id)).status).toBe(502)
        expect(fakeDb.rows("videos")[0].status).toBe("uploading")
    })

    it("reports database errors", async () => {
        const id = uploading(1, mp4(5))
        fakeDb.failOn("videos", "update")
        expect((await finish(id)).status).toBe(502)
        fakeDb.failOn("videos", "select")
        expect((await finish(id)).status).toBe(500)
    })
})

describe("POST /api/videos/upload", () => {
    const start = async (body: unknown, userId: string | null = alice) => upload.POST(await apiRequest("/api/videos/upload", { method: "POST", userId, body }))
    const file = { caption: "Squats", sizeBytes: 5_000_000, type: "video/mp4", durationSeconds: 30 }

    it("needs a login and a verified ID", async () => {
        expect((await start(file, null)).status).toBe(401)
        expect((await start(file)).status).toBe(403)
    })

    it("creates the video and a signed upload link for exactly this file", async () => {
        verify(alice)
        const res = await start({ ...file, type: "video/quicktime" })
        const body = await res.json()
        expect(body).toEqual({ video: { id: expect.any(String) }, uploadURL: expect.stringContaining(`/${BUCKET}/videos/${alice}/${body.video.id}.mov?op=PutObjectCommand&expires=1800`), contentType: "video/quicktime" })
        expect(fakeDb.rows("videos")).toEqual([expect.objectContaining({ id: body.video.id, user_id: alice, status: "uploading", caption: "Squats", size_bytes: 5_000_000 })])
    })

    it.each([
        [{ ...file, caption: "x".repeat(301) }, 400],
        [{ ...file, sizeBytes: 201 * 1024 * 1024 }, 413],
        [{ ...file, sizeBytes: 1.5 }, 413],
        [{ ...file, type: "video/webm" }, 415],
        [{ ...file, durationSeconds: 182 }, 400],
    ])("rejects %j", async (body, status) => {
        verify(alice)
        expect((await start(body)).status).toBe(status)
        expect(fakeDb.rows("videos")).toEqual([])
    })

    it("is unavailable until storage is set up", async () => {
        verify(alice)
        vi.stubEnv("R2_SECRET_ACCESS_KEY", "")
        expect((await start(file)).status).toBe(503)
    })

    it("allows three unfinished uploads at a time", async () => {
        verify(alice)
        for (let i = 0; i < 3; i++) expect((await start(file)).status).toBe(200)
        expect((await start(file)).status).toBe(429)
    })

    it("reports database errors", async () => {
        verify(alice)
        fakeDb.failOn("videos", "insert")
        expect((await start(file)).status).toBe(500)
        fakeDb.failOn("videos", "select")
        expect((await start(file)).status).toBe(500)
    })
})
