import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { UUID, VIDEO_WITH_AUTHOR, VideoRowWithAuthor, canView, decodeCursor, encodeCursor, olderThan, toCards } from "../../libs/videos";

const FEED_PAGE = 8

// GET /api/videos/feed?cursor=...&start=<videoId>
//   -> { videos: VideoCard[], nextCursor }
// The For You feed: ready videos from public profiles, newest first. ?start puts one video at the top
// (a shared link), if the viewer is allowed to see it.
export async function GET(req: NextRequest) {
    const viewerId = await getUserIdFromRequest(req)
    if (!viewerId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const params = new URL(req.url).searchParams
    const cursor = decodeCursor(params.get("cursor"))
    if (params.get("cursor") && !cursor) return NextResponse.json({ message: "Bad cursor" }, { status: 400 })
    const start = params.get("start")

    try {
        let query = supabase
            .from("videos")
            .select(VIDEO_WITH_AUTHOR)
            .eq("status", "ready")
            .eq("profiles.profile_privacy", "public")
        if (cursor) query = query.or(olderThan(cursor))
        const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(FEED_PAGE + 1)
        if (error) throw error

        const rows = (data ?? []) as unknown as VideoRowWithAuthor[]
        let page = rows.slice(0, FEED_PAGE)

        if (!cursor && start && UUID.test(start)) {
            const { data: first } = await supabase.from("videos").select(VIDEO_WITH_AUTHOR).eq("id", start).maybeSingle()
            const row = first as unknown as VideoRowWithAuthor | null
            if (row && row.status === "ready" && canView(row, row.profiles, viewerId)) {
                page = [row, ...page.filter((r) => r.id !== row.id)]
            }
        }

        return NextResponse.json({
            videos: await toCards(page, viewerId),
            nextCursor: rows.length > FEED_PAGE ? encodeCursor(rows[FEED_PAGE - 1]) : null,
        })
    } catch (e) {
        console.log("Error loading the feed: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load videos" }, { status: 500 })
    }
}
