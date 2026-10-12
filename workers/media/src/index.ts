// media.progressx.ca: serves the videos and thumbnails in the private R2 bucket through Cloudflare's
// cache. The bucket stays private (no public access, no custom domain on the bucket itself); this
// Worker reads it through a binding. Every request needs a link the app signed (progressx/src/app/api/
// libs/r2Videos.ts, mediaUrl), so a video only plays for people the app gave a link to, as before.
//
//   GET /<object key>?exp=<unix seconds>&sig=<base64url HMAC-SHA256 of "<object key>\n<exp>">
//
// The signature is checked on every request, then the file comes from this data centre's cache, which
// is keyed on the object alone (every signed link for a video shares one cached copy) and answers
// Range requests (seeking) itself. On a miss, the client is answered straight from R2 while the whole
// file is copied into the cache in the background.
//
// Secrets: MEDIA_SIGNING_KEY (the app has the same one). Binding: VIDEOS (the progressx-videos bucket).

// The parts of the Workers runtime used here, so this file needs no extra type packages
interface R2Range { offset?: number, length?: number, suffix?: number }
interface R2Object {
    size: number
    httpEtag: string
    uploaded: Date
    range?: R2Range
    httpMetadata?: { contentType?: string }
}
interface R2ObjectBody extends R2Object { body: ReadableStream }
export interface R2Bucket {
    head(key: string): Promise<R2Object | null>
    get(key: string, options?: { range?: Headers }): Promise<R2ObjectBody | null>
}
interface EdgeCache {
    match(request: Request): Promise<Response | undefined>
    put(request: Request, response: Response): Promise<void>
}
export interface Env { VIDEOS: R2Bucket, MEDIA_SIGNING_KEY: string }
export interface Ctx { waitUntil(promise: Promise<unknown>): void }

// only what the app stores: videos/<user id>/<video id>.<mp4|mov|jpg>
const KEY = /^videos\/[0-9A-Za-z-]{1,64}\/[0-9A-Za-z-]{1,64}\.(mp4|mov|jpg)$/
// how long a link may be valid for at most (the app signs for about 3-4 hours)
const MAX_LINK_SECONDS = 6 * 60 * 60
// how long the edge keeps a copy. A deleted video stays cached up to this long, but only someone
// holding a link signed before the deletion (valid a few hours at most) can still fetch it.
const EDGE_SECONDS = 24 * 60 * 60

const encoder = new TextEncoder()

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return null // 32 bytes, unpadded
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=")
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function hmacKey(secret: string, usage: "sign" | "verify") {
    return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage])
}

// The signature the app puts on a link (exported for tests; the app computes the same with node:crypto)
export async function signature(secret: string, key: string, exp: number): Promise<string> {
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(`${key}\n${exp}`)))
    return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function validLink(env: Env, key: string, url: URL, now: number): Promise<boolean> {
    const exp = Number(url.searchParams.get("exp"))
    const sig = fromBase64Url(url.searchParams.get("sig") ?? "")
    if (!Number.isInteger(exp) || exp < now || exp > now + MAX_LINK_SECONDS || !sig || !env.MEDIA_SIGNING_KEY) return false
    // constant-time comparison
    return crypto.subtle.verify("HMAC", await hmacKey(env.MEDIA_SIGNING_KEY, "verify"), sig, encoder.encode(`${key}\n${exp}`))
}

function fileHeaders(object: R2Object): Headers {
    return new Headers({
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "ETag": object.httpEtag,
        "Last-Modified": object.uploaded.toUTCString(),
        "Accept-Ranges": "bytes",
        "X-Content-Type-Options": "nosniff",
    })
}

const deny = (status: number, message: string) =>
    new Response(message, { status, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } })

export default {
    async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
        if (request.method !== "GET" && request.method !== "HEAD") return deny(405, "Method not allowed")
        const url = new URL(request.url)
        const key = decodeURIComponent(url.pathname.slice(1))
        if (!KEY.test(key)) return deny(404, "Not found")
        if (!(await validLink(env, key, url, Math.floor(Date.now() / 1000)))) return deny(403, "This link has expired or isn't valid")

        // the browser may keep it as long as the link it used is valid
        const browserCache = `private, max-age=${Math.max(0, Number(url.searchParams.get("exp")) - Math.floor(Date.now() / 1000))}`
        const cacheKey = new Request(`${url.origin}/${key}`, { method: "GET", headers: request.headers.has("Range") ? { Range: request.headers.get("Range")! } : {} })
        const cache = (globalThis as unknown as { caches: { default: EdgeCache } }).caches.default

        const cached = request.method === "GET" ? await cache.match(cacheKey) : undefined
        if (cached) {
            const headers = new Headers(cached.headers)
            headers.set("Cache-Control", browserCache)
            return new Response(cached.body, { status: cached.status, headers })
        }

        if (request.method === "HEAD") {
            const object = await env.VIDEOS.head(key)
            if (!object) return deny(404, "Not found")
            const headers = fileHeaders(object)
            headers.set("Content-Length", String(object.size))
            headers.set("Cache-Control", browserCache)
            return new Response(null, { headers })
        }

        const object = await env.VIDEOS.get(key, { range: request.headers })
        if (!object) return deny(404, "Not found")

        // fill the cache with the whole file from a second read, without making this viewer wait for it
        // (splitting one stream between the viewer and the cache would buffer up to a whole video in
        // the Worker's memory whenever the viewer reads slower than the cache)
        ctx.waitUntil((async () => {
            const whole = await env.VIDEOS.get(key)
            if (!whole) return
            const headers = fileHeaders(whole)
            headers.set("Content-Length", String(whole.size))
            headers.set("Cache-Control", `public, max-age=${EDGE_SECONDS}`)
            await cache.put(new Request(`${url.origin}/${key}`), new Response(whole.body, { headers }))
        })())

        const headers = fileHeaders(object)
        headers.set("Cache-Control", browserCache)
        const range = object.range
        if (range && (range.offset || (range.length ?? object.size) < object.size)) {
            const start = range.offset ?? object.size - (range.suffix ?? 0)
            const length = range.length ?? object.size - start
            headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`)
            headers.set("Content-Length", String(length))
            return new Response(object.body, { status: 206, headers })
        }
        headers.set("Content-Length", String(object.size))
        return new Response(object.body, { headers })
    },
}
