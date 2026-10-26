import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { adConfigFor } from "../../libs/ads";
import { UUID, VIDEO_WITH_AUTHOR, VideoRowWithAuthor, canView, toCards } from "../../libs/videos";
import { FEED_BATCH, pickRandom } from "@/app/internal_components/videos/feedPlan";

// How many of the newest videos random picks are drawn from, and how many recently shown ids a request
// may send (enough for a long session; older ones can come round again)
const POOL_SIZE = 2000
const MAX_SEEN = 100

// GET /api/videos/feed?seen=<id,id,...>&start=<videoId>
//   -> { videos: VideoCard[], ads: AdConfig | null }
// The For You feed, a few videos at a time: ready videos from public profiles, picked at random (no
// ranking yet). Open to visitors who aren't signed in (the public feed at /explore). ?seen lists the videos already shown, newest first, so they aren't repeated while there
// are others. ?start puts one video first (a shared link), if the viewer may see it.
export async function GET(req: NextRequest) {
    const viewerId = await getUserIdFromRequest(req) // null: not signed in

    const params = new URL(req.url).searchParams
    const seen = (params.get("seen") ?? "").split(",").filter((id) => UUID.test(id)).slice(0, MAX_SEEN)
    const start = params.get("start")

    try {
        const { data: pool, error: poolError } = await supabase
            .from("videos")
            .select("id, profiles!videos_user_id_fkey!inner(profile_privacy)")
            .eq("status", "ready")
            .eq("profiles.profile_privacy", "public")
            .order("created_at", { ascending: false })
            .limit(POOL_SIZE)
        if (poolError) throw poolError

        let ids = pickRandom((pool ?? []).map((row) => row.id as string), seen, FEED_BATCH)
        if (start && UUID.test(start) && !seen.includes(start)) ids = [start, ...ids.filter((id) => id !== start)]

        let rows: VideoRowWithAuthor[] = []
        if (ids.length) {
            const { data, error } = await supabase.from("videos").select(VIDEO_WITH_AUTHOR).in("id", ids)
            if (error) throw error
            const byId = new Map((data as unknown as VideoRowWithAuthor[]).map((row) => [row.id, row]))
            // keep the random order; a shared video only if the viewer may see it
            rows = ids.map((id) => byId.get(id)).filter((row): row is VideoRowWithAuthor => !!row && row.status === "ready" && canView(row, row.profiles, viewerId))
        }

        return NextResponse.json({ videos: await toCards(rows, viewerId), ads: await adConfigFor(viewerId) })
    } catch (e) {
        console.log("Error loading the feed: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load videos" }, { status: 500 })
    }
}
