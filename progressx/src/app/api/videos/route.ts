import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../libs/helpers";
import { canSeeProfile, followingSet } from "../libs/follows";
import { PAGE_SIZE, findProfileByUsername, VIDEO_WITH_AUTHOR, VideoRowWithAuthor, canView, decodeCursor, encodeCursor, olderThan, syncVideo, toCards } from "../libs/videos";

const MAX_SYNCS = 6 // abandoned-upload cleanups per request

// GET /api/videos?user=<username>|me&tab=videos|liked|favourites&cursor=...
//   -> { videos: VideoCard[], nextCursor: string | null }       or { private: true } (403)
// "videos": what that person posted (your own include unfinished uploads). "liked" and
// "favourites" are only ever your own lists. A public profile's videos can be listed by anyone,
// signed in or not, a private one's by its approved followers; "me", liked and favourites need a login.
export async function GET(req: NextRequest) {
    const viewerId = await getUserIdFromRequest(req)
    const params = new URL(req.url).searchParams
    const tab = params.get("tab") ?? "videos"
    const user = params.get("user") ?? "me"
    if (!viewerId && (user === "me" || tab !== "videos")) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    const cursor = decodeCursor(params.get("cursor"))
    if (params.get("cursor") && !cursor) return NextResponse.json({ message: "Bad cursor" }, { status: 400 })

    try {
        if (tab === "liked" || tab === "favourites") {
            if (user !== "me") return NextResponse.json({ message: "Only your own likes and favourites can be listed" }, { status: 403 })
            return NextResponse.json(await reactedVideos(viewerId!, tab === "liked" ? "video_likes" : "video_favourites", cursor))
        }
        if (tab !== "videos") return NextResponse.json({ message: "tab must be videos, liked or favourites" }, { status: 400 })

        let ownerId = viewerId as string // "me" was refused above for visitors who aren't signed in
        let followed: ReadonlySet<string> = new Set()
        if (user !== "me") {
            const owner = await findProfileByUsername<{ id: string, profile_privacy: string | null }>(user, "id, profile_privacy")
            if (!owner) return NextResponse.json({ message: "No such profile" }, { status: 404 })
            // to visitors who aren't signed in, a private profile looks like it doesn't exist
            if (!viewerId && owner.profile_privacy !== "public") return NextResponse.json({ message: "No such profile" }, { status: 404 })
            if (!await canSeeProfile(viewerId, owner)) {
                return NextResponse.json({ private: true, videos: [], nextCursor: null }, { status: 403 })
            }
            ownerId = owner.id
            followed = new Set([owner.id]) // they can see this profile, so its videos as well
        }

        let query = supabase.from("videos").select(VIDEO_WITH_AUTHOR).eq("user_id", ownerId)
        if (ownerId !== viewerId) query = query.eq("status", "ready")
        if (cursor) query = query.or(olderThan(cursor))
        const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE + 1)
        if (error) throw error

        const rows = (data ?? []) as unknown as VideoRowWithAuthor[]
        const page = rows.slice(0, PAGE_SIZE)

        // your own unfinished uploads: clear out ones that were abandoned
        let synced = 0
        const current: VideoRowWithAuthor[] = []
        for (const row of page) {
            if (row.user_id === viewerId && row.status === "uploading" && synced < MAX_SYNCS) {
                synced++
                const fresh = await syncVideo(row).catch((e) => {
                    console.log("Couldn't clear an abandoned upload: ", e instanceof Error ? e.message : e)
                    return row
                })
                if (fresh) current.push(fresh)
            } else {
                current.push(row)
            }
        }

        return NextResponse.json({
            videos: await toCards(current.filter((row) => canView(row, row.profiles, viewerId, followed)), viewerId),
            nextCursor: rows.length > PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null,
        })
    } catch (e) {
        console.log("Error listing videos: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load videos" }, { status: 500 })
    }
}

// The viewer's liked or favourited videos, most recently liked first. Videos that are no longer
// visible (the poster went private, and the viewer doesn't follow them) stay recorded but aren't shown.
async function reactedVideos(viewerId: string, table: "video_likes" | "video_favourites", cursor: { createdAt: string, id: string } | null) {
    let query = supabase.from(table).select(`created_at, video_id, videos!inner(${VIDEO_WITH_AUTHOR})`).eq("user_id", viewerId)
    if (cursor) query = query.or(olderThan(cursor, "created_at", "video_id"))
    const { data, error } = await query.order("created_at", { ascending: false }).order("video_id", { ascending: false }).limit(PAGE_SIZE + 1)
    if (error) throw error

    const rows = (data ?? []) as unknown as { created_at: string, video_id: string, videos: VideoRowWithAuthor }[]
    const page = rows.slice(0, PAGE_SIZE)
    const followed = await followingSet(viewerId, page.map((r) => r.videos?.user_id).filter((id): id is string => Boolean(id)))
    const visible = page.map((r) => r.videos).filter((video) => video && canView(video, video.profiles, viewerId, followed))
    const last = page[page.length - 1]
    return {
        videos: await toCards(visible, viewerId),
        nextCursor: rows.length > PAGE_SIZE ? encodeCursor({ created_at: last.created_at, id: last.video_id }) : null,
    }
}
