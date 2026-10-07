import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { UUID, canView, overLimit, type Author, type VideoStatus } from "../../../libs/videos";

const TABLES = { like: "video_likes", favourite: "video_favourites" } as const
type Reaction = keyof typeof TABLES
type Context = { params: Promise<{ id: string, reaction: string }> }

// PUT /api/videos/:id/like | /favourite     -> like / favourite it
// DELETE /api/videos/:id/like | /favourite  -> undo
// Either way the answer is the video's new counts: { likes, favourites, liked, favourited }
export const PUT = (req: NextRequest, context: Context) => react(req, context, true)
export const DELETE = (req: NextRequest, context: Context) => react(req, context, false)

async function react(req: NextRequest, context: Context, on: boolean) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { id, reaction } = await context.params
    if (!(reaction in TABLES)) return NextResponse.json({ message: "Not found" }, { status: 404 })
    if (!UUID.test(id)) return NextResponse.json({ message: "Video not found" }, { status: 404 })
    if (overLimit(`react:${userId}`, 120, 60 * 1000)) {
        return NextResponse.json({ message: "Slow down a little" }, { status: 429 })
    }

    const { data: video, error } = await supabase
        .from("videos")
        .select("id, user_id, status, profiles!videos_user_id_fkey!inner(profile_privacy)")
        .eq("id", id)
        .maybeSingle()
    if (error) {
        console.log("Error loading video for a reaction: ", error.message)
        return NextResponse.json({ message: "Couldn't save that" }, { status: 500 })
    }
    const row = video as unknown as { id: string, user_id: string, status: VideoStatus, profiles: Pick<Author, "profile_privacy"> } | null
    // you can always take a like back; adding one needs the video to be visible to you
    if (!row || (on && (!canView(row, row.profiles, userId) || row.status !== "ready"))) {
        return NextResponse.json({ message: "Video not found" }, { status: 404 })
    }

    const table = TABLES[reaction as Reaction]
    const result = on
        ? await supabase.from(table).upsert({ user_id: userId, video_id: id }, { onConflict: "user_id,video_id", ignoreDuplicates: true })
        : await supabase.from(table).delete().eq("user_id", userId).eq("video_id", id)
    if (result.error) {
        console.log(`Error saving ${reaction}: `, result.error.message)
        return NextResponse.json({ message: "Couldn't save that" }, { status: 500 })
    }

    const [ counts, liked, favourited ] = await Promise.all([
        supabase.from("videos").select("likes_count, favourites_count").eq("id", id).single(),
        supabase.from("video_likes").select("video_id", { head: true, count: "exact" }).eq("user_id", userId).eq("video_id", id),
        supabase.from("video_favourites").select("video_id", { head: true, count: "exact" }).eq("user_id", userId).eq("video_id", id),
    ])
    return NextResponse.json({
        likes: counts.data?.likes_count ?? 0,
        favourites: counts.data?.favourites_count ?? 0,
        liked: (liked.count ?? 0) > 0,
        favourited: (favourited.count ?? 0) > 0,
    })
}
