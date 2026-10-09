// Shared by the video API routes and the pages that show videos

export const CAPTION_MAX = 300
export const MAX_VIDEO_SECONDS = 180
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
// videos play as uploaded (no transcoding), so only the formats every browser handles: MP4 and MOV
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/x-m4v"]

export type VideoStatus = "uploading" | "ready" | "failed"

export type Playback = { src: string, poster: string | null }

export type VideoCard = {
    id: string,
    caption: string,
    createdAt: string,
    status: VideoStatus,
    durationS: number | null,
    width: number | null,
    height: number | null,
    likes: number,
    favourites: number,
    liked: boolean,
    favourited: boolean,
    isOwner: boolean,
    author: { username: string, name: string, pfp: string | null, following: boolean }, // following: the viewer follows them
    playback: Playback | null,
}

export type Reaction = "like" | "favourite"

export type ReactionState = Pick<VideoCard, "likes" | "favourites" | "liked" | "favourited">

// 1234 -> "1.2K"
export function formatCount(n: number): string {
    if (n < 1000) return String(n)
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

export function formatDuration(seconds: number | null): string {
    if (!seconds) return ""
    const s = Math.round(seconds)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// Follows / unfollows someone; resolves to whether you now follow them and their follower count
export async function setFollow(username: string, on: boolean): Promise<{ following: boolean, followers: number }> {
    const res = await fetch(`/api/profiles/${encodeURIComponent(username)}/follow`, { method: on ? "PUT" : "DELETE" })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(json?.message ?? "Couldn't save that")
    return json
}

// Likes / favourites a video (or undoes it); resolves to the video's new counts
export async function setReaction(videoId: string, reaction: Reaction, on: boolean): Promise<ReactionState> {
    const res = await fetch(`/api/videos/${videoId}/${reaction}`, { method: on ? "PUT" : "DELETE" })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(json?.message ?? "Couldn't save that")
    return json as ReactionState
}
