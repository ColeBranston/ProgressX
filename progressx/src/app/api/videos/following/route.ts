import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { followedIds } from "../../libs/follows";
import { VIDEO_WITH_AUTHOR, VideoRowWithAuthor, decodeCursor, encodeCursor, olderThan, toCards } from "../../libs/videos";

const FEED_PAGE = 8

// GET /api/videos/following?cursor=...   -> { videos: VideoCard[], nextCursor, followsAnyone }
// The Following feed: newest videos from the people you follow. Private profiles' videos stay private
// even to their followers (private means only the owner sees them).
export async function GET(req: NextRequest) {
    const viewerId = await getUserIdFromRequest(req)
    if (!viewerId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const raw = new URL(req.url).searchParams.get("cursor")
    const cursor = decodeCursor(raw)
    if (raw && !cursor) return NextResponse.json({ message: "Bad cursor" }, { status: 400 })

    try {
        const ids = await followedIds(viewerId)
        if (!ids.length) return NextResponse.json({ videos: [], nextCursor: null, followsAnyone: false })

        let query = supabase
            .from("videos")
            .select(VIDEO_WITH_AUTHOR)
            .eq("status", "ready")
            .eq("profiles.profile_privacy", "public")
            .in("user_id", ids)
        if (cursor) query = query.or(olderThan(cursor))
        const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(FEED_PAGE + 1)
        if (error) throw error

        const rows = (data ?? []) as unknown as VideoRowWithAuthor[]
        return NextResponse.json({
            videos: await toCards(rows.slice(0, FEED_PAGE), viewerId),
            nextCursor: rows.length > FEED_PAGE ? encodeCursor(rows[FEED_PAGE - 1]) : null,
            followsAnyone: true,
        })
    } catch (e) {
        console.log("Error loading the following feed: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load videos" }, { status: 500 })
    }
}
