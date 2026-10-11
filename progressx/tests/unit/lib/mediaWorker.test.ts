import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import worker, { signature, type Env, type R2Bucket } from "../../../../workers/media/src/index"
import { mediaUrl, playbackFor } from "@/app/api/libs/r2Videos"

// The media Worker (workers/media) run in Node against an in-memory bucket and edge cache, with links
// signed by the app's own code, so the two sides can't drift apart.

const SECRET = "test-signing-key-0123456789abcdef"
const KEY = "videos/2b1e0c7a-1111-4222-8333-944455556666/9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff.mp4"
const VIDEO = Uint8Array.from({ length: 1000 }, (_, i) => i % 256)
const BASE = "https://media.progressx.ca"

function fakeBucket(files: Record<string, Uint8Array>) {
    const reads: string[] = []
    const meta = (key: string, range?: { offset: number, length: number }) => ({
        size: files[key].length, httpEtag: '"etag-1"', uploaded: new Date(0), httpMetadata: { contentType: "video/mp4" }, range,
    })
    const bucket: R2Bucket = {
        async head(key) { return files[key] ? meta(key) : null },
        async get(key, options) {
            if (!files[key]) return null
            const header = options?.range?.get("Range")
            const match = header?.match(/^bytes=(\d+)-(\d*)$/)
            const size = files[key].length
            const offset = match ? Number(match[1]) : 0
            const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
            reads.push(match ? `${key}#${offset}-${end}` : key)
            return { ...meta(key, match ? { offset, length: end - offset + 1 } : undefined), body: new Blob([files[key].slice(offset, end + 1)]).stream() }
        },
    }
    return { bucket, reads }
}

function fakeCache() {
    const store = new Map<string, { headers: Headers, body: Uint8Array }>()
    return {
        store,
        async match(request: Request) {
            const hit = store.get(request.url)
            if (!hit) return undefined
            const range = request.headers.get("Range")?.match(/^bytes=(\d+)-(\d*)$/)
            if (!range) return new Response(hit.body.slice(), { headers: hit.headers })
            const start = Number(range[1]), end = range[2] ? Number(range[2]) : hit.body.length - 1
            const headers = new Headers(hit.headers)
            headers.set("Content-Range", `bytes ${start}-${end}/${hit.body.length}`)
            return new Response(hit.body.slice(start, end + 1), { status: 206, headers })
        },
        async put(request: Request, response: Response) {
            store.set(request.url, { headers: response.headers, body: new Uint8Array(await response.arrayBuffer()) })
        },
    }
}

let cache: ReturnType<typeof fakeCache>
let pending: Promise<unknown>[]
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p) } }
const now = () => Math.floor(Date.now() / 1000)
const link = (key = KEY, exp = now() + 3600, secret = SECRET) => mediaUrl(BASE, secret, key, exp)

beforeEach(() => {
    cache = fakeCache()
    pending = []
    vi.stubGlobal("caches", { default: cache })
})
afterEach(() => { vi.unstubAllGlobals() })

describe("media Worker", () => {
    it("accepts the app's links and computes the same signature", async () => {
        const exp = now() + 60
        const url = new URL(link(KEY, exp))
        expect(url.searchParams.get("sig")).toBe(await signature(SECRET, KEY, exp))
    })

    it("serves a video and fills the cache with the whole file", async () => {
        const { bucket } = fakeBucket({ [KEY]: VIDEO })
        const env: Env = { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }
        const res = await worker.fetch(new Request(link()), env, ctx)
        expect(res.status).toBe(200)
        expect(res.headers.get("Content-Type")).toBe("video/mp4")
        expect(res.headers.get("Content-Length")).toBe("1000")
        expect(res.headers.get("Cache-Control")).toMatch(/^private, max-age=\d+$/)
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(VIDEO)
        await Promise.all(pending)
        // one copy per object, whatever link was used
        expect([...cache.store.keys()]).toEqual([`${BASE}/${KEY}`])
        expect(cache.store.get(`${BASE}/${KEY}`)!.headers.get("Cache-Control")).toBe("public, max-age=86400")
    })

    it("answers seeking on a miss straight from R2, then from the cache", async () => {
        const { bucket, reads } = fakeBucket({ [KEY]: VIDEO })
        const env: Env = { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }
        const first = await worker.fetch(new Request(link(), { headers: { Range: "bytes=100-199" } }), env, ctx)
        expect(first.status).toBe(206)
        expect(first.headers.get("Content-Range")).toBe("bytes 100-199/1000")
        expect(first.headers.get("Content-Length")).toBe("100")
        expect(new Uint8Array(await first.arrayBuffer())).toEqual(VIDEO.slice(100, 200))
        await Promise.all(pending)

        // a different (later) link to the same video: served from the cache, R2 not read again
        const readsBefore = reads.length
        const second = await worker.fetch(new Request(link(KEY, now() + 7200), { headers: { Range: "bytes=500-" } }), env, ctx)
        expect(second.status).toBe(206)
        expect(second.headers.get("Cache-Control")).toMatch(/^private, max-age=\d+$/)
        expect(new Uint8Array(await second.arrayBuffer())).toEqual(VIDEO.slice(500))
        expect(reads.length).toBe(readsBefore)
    })

    it("answers HEAD without reading the file", async () => {
        const { bucket, reads } = fakeBucket({ [KEY]: VIDEO })
        const res = await worker.fetch(new Request(link(), { method: "HEAD" }), { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }, ctx)
        expect(res.status).toBe(200)
        expect(res.headers.get("Content-Length")).toBe("1000")
        expect(reads).toEqual([])
    })

    it.each([
        ["an expired link", () => link(KEY, now() - 1)],
        ["a link valid for too long", () => link(KEY, now() + 7 * 3600)],
        ["a link signed with another key", () => link(KEY, now() + 60, "some-other-key")],
        ["a link for another video", () => link(KEY, now() + 60).replace("9f8e7d6c", "00000000")],
        ["a link without a signature", () => `${BASE}/${KEY}?exp=${now() + 60}`],
        ["a malformed signature", () => `${BASE}/${KEY}?exp=${now() + 60}&sig=abc`],
    ])("refuses %s", async (_, makeUrl) => {
        const { bucket, reads } = fakeBucket({ [KEY]: VIDEO })
        const res = await worker.fetch(new Request(makeUrl()), { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }, ctx)
        expect(res.status).toBe(403)
        expect(res.headers.get("Cache-Control")).toBe("no-store")
        expect(reads).toEqual([])
    })

    it("refuses everything when the Worker has no signing key", async () => {
        const { bucket } = fakeBucket({ [KEY]: VIDEO })
        const res = await worker.fetch(new Request(link()), { VIDEOS: bucket, MEDIA_SIGNING_KEY: "" }, ctx)
        expect(res.status).toBe(403)
    })

    it.each([
        ["anything outside videos/", "ids/someone/front.jpg"],
        ["path tricks", "videos/a/../../ids/x.mp4"],
        ["other file types", "videos/a/b.html"],
    ])("never serves %s", async (_, key) => {
        const { bucket, reads } = fakeBucket({ [key]: VIDEO })
        const res = await worker.fetch(new Request(link(key)), { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }, ctx)
        expect(res.status).toBe(404)
        expect(reads).toEqual([])
    })

    it("only allows reading", async () => {
        const { bucket } = fakeBucket({ [KEY]: VIDEO })
        const res = await worker.fetch(new Request(link(), { method: "PUT", body: "x" }), { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }, ctx)
        expect(res.status).toBe(405)
    })

    it("404s a deleted video", async () => {
        const { bucket } = fakeBucket({})
        const res = await worker.fetch(new Request(link()), { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }, ctx)
        expect(res.status).toBe(404)
    })
})

describe("playbackFor", () => {
    it("links to the media Worker when it's configured, the same link all hour", async () => {
        vi.stubEnv("MEDIA_BASE_URL", `${BASE}/`)
        vi.stubEnv("MEDIA_SIGNING_KEY", SECRET)
        const poster = KEY.replace(".mp4", ".jpg")
        const playback = await playbackFor(KEY, poster)
        const src = new URL(playback.src)
        expect(src.origin + src.pathname).toBe(`${BASE}/${KEY}`)
        const exp = Number(src.searchParams.get("exp"))
        expect(exp % 3600).toBe(0) // the hour it was signed in + 3 hours
        expect(exp - now()).toBeGreaterThan(2 * 3600)
        expect(exp - now()).toBeLessThanOrEqual(3 * 3600)
        expect(new URL(playback.poster!).pathname).toBe(`/${poster}`)
        expect(await playbackFor(KEY, poster)).toEqual(playback)

        // and the Worker accepts it
        const { bucket } = fakeBucket({ [KEY]: VIDEO })
        const res = await worker.fetch(new Request(playback.src), { VIDEOS: bucket, MEDIA_SIGNING_KEY: SECRET }, ctx)
        expect(res.status).toBe(200)
    })

    it("falls back to signed R2 links without the Worker", async () => {
        vi.stubEnv("MEDIA_BASE_URL", "")
        vi.stubEnv("R2_ACCOUNT_ID", "acct")
        vi.stubEnv("R2_ACCESS_KEY_ID", "id")
        vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret")
        const playback = await playbackFor(KEY, null)
        expect(new URL(playback.src).host).toMatch(/(^|\.)acct\.r2\.cloudflarestorage\.com$/)
        expect(playback.poster).toBeNull()
    })
})
