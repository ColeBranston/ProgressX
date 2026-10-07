import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, type Playback } from "@/app/internal_components/videos/videoTypes";

// Videos live in a private Cloudflare R2 bucket. The browser uploads straight to R2 with a one-time
// signed link (the file never passes through this server), and plays videos from short-lived signed
// links, so a video only plays for people this app gave a link to. There's no transcoding: videos play
// as uploaded, so uploads are checked here to be real MP4 / MOV files within the length limit.
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (an R2 API token with Object Read & Write
// on the bucket), R2_VIDEO_BUCKET (default "progressx-videos")

const UPLOAD_LINK_SECONDS = 30 * 60
const PLAYBACK_SECONDS = 3 * 60 * 60
const MAX_MOOV_BYTES = 16 * 1024 * 1024
const MAX_POSTER_BYTES = 600 * 1024

export class StorageNotConfiguredError extends Error {
    constructor() { super("R2 video storage isn't configured") }
}

export function storageConfigured() {
    return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

const bucket = () => process.env.R2_VIDEO_BUCKET || "progressx-videos"

let client: S3Client | null = null
function r2() {
    if (!storageConfigured()) throw new StorageNotConfiguredError()
    if (!client) {
        client = new S3Client({
            region: "auto",
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
            // R2 doesn't need the SDK's default checksums, and they'd break browser uploads with signed links
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        })
    }
    return client
}

// Every object of one user sits under their own prefix, so account deletion can find them all
export const userPrefix = (userId: string) => `videos/${userId}/`
export const videoKey = (userId: string, videoId: string, ext: "mp4" | "mov") => `${userPrefix(userId)}${videoId}.${ext}`
export const posterKey = (userId: string, videoId: string) => `${userPrefix(userId)}${videoId}.jpg`

// A one-time upload link for exactly this file: the size and type are part of the signature, so R2
// refuses a different (e.g. bigger) file
export async function createUploadUrl(key: string, contentType: string, sizeBytes: number) {
    return getSignedUrl(
        r2(),
        new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: sizeBytes }),
        { expiresIn: UPLOAD_LINK_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
    )
}

export type UploadCheck =
    | { ok: true, sizeBytes: number, durationS: number, contentType: string }
    | { ok: false, reason: "missing" | "too_big" | "not_video" | "too_long" | "unreadable" }

async function readRange(key: string, start: number, end: number): Promise<Uint8Array> {
    const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=${start}-${end}` }))
    return res.Body ? await res.Body.transformToByteArray() : new Uint8Array()
}

// Checks an uploaded file really is an MP4 / MOV video (its bytes, not its name or the browser's word)
// within the size and length limits, by reading its box structure with ranged reads
export async function checkUpload(key: string): Promise<UploadCheck> {
    let size: number
    try {
        const head = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
        size = Number(head.ContentLength ?? 0)
    } catch (e) {
        if ((e as { name?: string })?.name === "NotFound" || (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
            return { ok: false, reason: "missing" }
        }
        throw e
    }
    return inspectVideo(size, (start, end) => readRange(key, start, end))
}

// The checks behind checkUpload, given the file's size and a way to read byte ranges (inclusive)
export async function inspectVideo(size: number, read: (start: number, end: number) => Promise<Uint8Array>): Promise<UploadCheck> {
    if (size <= 0) return { ok: false, reason: "missing" }
    if (size > MAX_VIDEO_BYTES) return { ok: false, reason: "too_big" }

    // walk the top-level boxes: [size:4][type:4] (size 1 = 64-bit size follows, 0 = to the end)
    let offset = 0
    let brand: string | null = null
    let duration: number | null = null
    for (let i = 0; i < 32 && offset + 8 <= size; i++) {
        const header = await read(offset, Math.min(offset + 15, size - 1))
        if (header.length < 8) break
        const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
        let boxSize = view.getUint32(0)
        const type = String.fromCharCode(...header.subarray(4, 8))
        let headerSize = 8
        if (i === 0 && type !== "ftyp") return { ok: false, reason: "not_video" }
        if (boxSize === 1) {
            if (header.length < 16) return { ok: false, reason: "unreadable" }
            boxSize = Number(view.getBigUint64(8))
            headerSize = 16
        } else if (boxSize === 0) {
            boxSize = size - offset
        }
        if (boxSize < headerSize || offset + boxSize > size) return { ok: false, reason: "unreadable" }

        if (i === 0) {
            brand = String.fromCharCode(...header.subarray(8, 12))
        }
        if (type === "moov") {
            if (boxSize > MAX_MOOV_BYTES) return { ok: false, reason: "unreadable" }
            const moov = await read(offset + headerSize, offset + boxSize - 1)
            duration = movieDuration(moov)
            break
        }
        offset += boxSize
    }

    if (!brand) return { ok: false, reason: "not_video" }
    if (duration === null) return { ok: false, reason: "unreadable" }
    if (duration > MAX_VIDEO_SECONDS + 1) return { ok: false, reason: "too_long" }
    return { ok: true, sizeBytes: size, durationS: duration, contentType: brand.startsWith("qt") ? "video/quicktime" : "video/mp4" }
}

// The movie's length in seconds from moov > mvhd
function movieDuration(moov: Uint8Array): number | null {
    const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength)
    for (let at = 0; at + 8 <= moov.length;) {
        const boxSize = view.getUint32(at)
        const type = String.fromCharCode(...moov.subarray(at + 4, at + 8))
        if (boxSize < 8) return null
        if (type === "mvhd") {
            if (at + 40 > moov.length) return null
            const version = moov[at + 8]
            const timescale = version === 1 ? view.getUint32(at + 28) : view.getUint32(at + 20)
            const length = version === 1 ? Number(view.getBigUint64(at + 32)) : view.getUint32(at + 24)
            return timescale > 0 ? length / timescale : null
        }
        at += boxSize
    }
    return null
}

// Saves the poster image (already re-encoded by the caller) next to the video
export async function putPoster(key: string, jpeg: Buffer) {
    if (jpeg.length > MAX_POSTER_BYTES) throw new Error("Poster too large")
    await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: jpeg, ContentType: "image/jpeg", CacheControl: "private, max-age=86400" }))
}

// Signed links to watch a video. They're signed for the current hour, so everyone loading the feed in
// the same hour gets the same URL and the browser can reuse what it already downloaded.
export async function playbackFor(videoKeyName: string, posterKeyName: string | null): Promise<Playback> {
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
    const sign = (key: string) => getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: PLAYBACK_SECONDS, signingDate: hour })
    const [ src, poster ] = await Promise.all([ sign(videoKeyName), posterKeyName ? sign(posterKeyName) : Promise.resolve(null) ])
    return { src, poster }
}

export async function deleteObjects(keys: string[]) {
    const unique = [...new Set(keys.filter(Boolean))]
    for (let i = 0; i < unique.length; i += 1000) {
        const res = await r2().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: unique.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }))
        if (res.Errors?.length) throw new Error(`R2 couldn't delete ${res.Errors.length} object(s): ${res.Errors[0].Message}`)
    }
}

// Every object under the user's prefix (videos, posters, and uploads the database never heard about)
export async function deleteUserObjects(userId: string): Promise<number> {
    let deleted = 0
    let token: string | undefined
    do {
        const page = await r2().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: userPrefix(userId), ContinuationToken: token }))
        const keys = (page.Contents ?? []).map((o) => o.Key!).filter(Boolean)
        if (keys.length) await deleteObjects(keys)
        deleted += keys.length
        token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return deleted
}
