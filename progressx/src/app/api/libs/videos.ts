import { supabase } from "@/app/supabaseClient/client";
import { deleteObjects, playbackFor } from "./r2Videos";
import { CAPTION_MAX, type Playback, type VideoCard, type VideoStatus } from "@/app/internal_components/videos/videoTypes";

export type { VideoCard, VideoStatus }

// Videos: who can see what, and the shape the pages get.
//
// Visibility: your own videos are always visible to you (any state). Anyone else's video is visible
// only once it's ready AND its poster's profile is public. A private profile hides all of its videos,
// including from the For You feed and from other people's Liked / Favourites lists.

export const PAGE_SIZE = 12

export type VideoRow = {
    id: string,
    user_id: string,
    object_key: string,
    poster_key: string | null,
    caption: string,
    status: VideoStatus,
    duration_s: number | string | null,
    width: number | null,
    height: number | null,
    likes_count: number,
    favourites_count: number,
    created_at: string,
}

export type Author = { display_username: string | null, display_name: string | null, profile_image: string | null, profile_privacy: string | null }

export type VideoRowWithAuthor = VideoRow & { profiles: Author | null }

export const VIDEO_COLUMNS = "id, user_id, object_key, poster_key, caption, status, duration_s, width, height, likes_count, favourites_count, created_at"
export const VIDEO_WITH_AUTHOR = `${VIDEO_COLUMNS}, profiles!videos_user_id_fkey!inner(display_username, display_name, profile_image, profile_privacy)`


export function canView(video: Pick<VideoRow, "user_id" | "status">, author: Pick<Author, "profile_privacy"> | null, viewerId: string) {
    if (video.user_id === viewerId) return true
    return video.status === "ready" && author?.profile_privacy === "public"
}

// Which of these videos the viewer has liked / favourited
export async function reactionsFor(viewerId: string, videoIds: string[]) {
    if (!videoIds.length) return { liked: new Set<string>(), favourited: new Set<string>() }
    const [likes, favourites] = await Promise.all([
        supabase.from("video_likes").select("video_id").eq("user_id", viewerId).in("video_id", videoIds),
        supabase.from("video_favourites").select("video_id").eq("user_id", viewerId).in("video_id", videoIds),
    ])
    if (likes.error) throw likes.error
    if (favourites.error) throw favourites.error
    return {
        liked: new Set(likes.data.map((r) => r.video_id as string)),
        favourited: new Set(favourites.data.map((r) => r.video_id as string)),
    }
}

// Cards for videos the viewer is allowed to see (callers filter with canView first)
export async function toCards(rows: VideoRowWithAuthor[], viewerId: string): Promise<VideoCard[]> {
    const { liked, favourited } = await reactionsFor(viewerId, rows.map((r) => r.id))
    return Promise.all(rows.map(async (row) => {
        let playback: Playback | null = null
        if (row.status === "ready") {
            try {
                playback = await playbackFor(row.object_key, row.poster_key)
            } catch (e) {
                console.log("Couldn't sign playback for a video: ", e instanceof Error ? e.message : e)
            }
        }
        return {
            id: row.id,
            caption: row.caption,
            createdAt: row.created_at,
            status: row.status,
            durationS: row.duration_s === null ? null : Number(row.duration_s),
            width: row.width,
            height: row.height,
            likes: row.likes_count,
            favourites: row.favourites_count,
            liked: liked.has(row.id),
            favourited: favourited.has(row.id),
            isOwner: row.user_id === viewerId,
            author: {
                username: row.profiles?.display_username ?? "",
                name: row.profiles?.display_name ?? "",
                pfp: row.profiles?.profile_image ?? null,
            },
            playback,
        }
    }))
}

const ABANDONED_UPLOAD_MS = 2 * 60 * 60 * 1000

// An upload that never finished (the tab closed, or the file never arrived) is removed once its link
// has long expired. Returns null when the video was removed, otherwise the row unchanged.
export async function syncVideo<T extends VideoRow>(row: T): Promise<T | null> {
    if (row.status !== "uploading" || Date.now() - Date.parse(row.created_at) < ABANDONED_UPLOAD_MS) return row
    await deleteObjects([row.object_key, row.poster_key ?? ""])
    const { error } = await supabase.from("videos").delete().eq("id", row.id)
    if (error) throw error
    return null
}

// Keyset pagination over (created_at, id), newest first
export function encodeCursor(row: { created_at: string, id: string }) {
    return Buffer.from(`${row.created_at}|${row.id}`).toString("base64url")
}

export function decodeCursor(raw: string | null): { createdAt: string, id: string } | null {
    if (!raw || raw.length > 200) return null
    const [ createdAt, id ] = Buffer.from(raw, "base64url").toString("utf8").split("|")
    if (!createdAt || Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/.test(id ?? "")) return null
    return { createdAt, id }
}

// PostgREST filter for "older than the cursor" on the given columns
export function olderThan(cursor: { createdAt: string, id: string }, createdCol = "created_at", idCol = "id") {
    const at = `"${cursor.createdAt}"`
    return `${createdCol}.lt.${at},and(${createdCol}.eq.${at},${idCol}.lt.${cursor.id})`
}

export function cleanCaption(raw: unknown): string | null {
    if (raw === undefined || raw === null) return ""
    if (typeof raw !== "string") return null
    // plain text only: drop control characters (keep new lines), squeeze blank lines
    const text = raw.normalize("NFC").replace(/[^\P{C}\n]/gu, "").replace(/\n{3,}/g, "\n\n").trim()
    return text.length > CAPTION_MAX ? null : text
}

// Simple in-memory sliding-window limiter, per user and action
const recent = new Map<string, number[]>()

export function overLimit(key: string, max: number, windowMs: number): boolean {
    const now = Date.now()
    const hits = (recent.get(key) ?? []).filter((at) => now - at < windowMs)
    const over = hits.length >= max
    if (!over) hits.push(now)
    recent.set(key, hits)
    if (recent.size > 10_000) recent.clear()
    return over
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// A profile by its username (usernames are unique ignoring case; _ is escaped so it isn't a wildcard)
export async function findProfileByUsername<T = Record<string, unknown>>(username: string, columns: string): Promise<T | null> {
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username)) return null
    const { data, error } = await supabase
        .from("profiles")
        .select(columns)
        .ilike("display_username", username.replace(/_/g, "\\_"))
        .maybeSingle()
    if (error) throw error
    return data as T | null
}
