import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { profileFromRoute } from "../../../libs/follows";
import { overLimit } from "../../../libs/videos";
import { requireVerified } from "../../../libs/requireVerified";

type Context = { params: Promise<{ username: string }> }

// PUT /api/profiles/:username/follow     -> follow them
// DELETE /api/profiles/:username/follow  -> unfollow
// Either way the answer is { following, followers } (their new follower count)
export const PUT = (req: NextRequest, context: Context) => setFollow(req, context, true)
export const DELETE = (req: NextRequest, context: Context) => setFollow(req, context, false)

async function setFollow(req: NextRequest, context: Context, on: boolean) {
    const viewerId = await getUserIdFromRequest(req)
    if (!viewerId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    if (on) {
        const unverified = await requireVerified(viewerId, "follow people")
        if (unverified) return unverified
    }
    if (overLimit(`follow:${viewerId}`, 60, 60 * 1000)) return NextResponse.json({ message: "Slow down a little" }, { status: 429 })

    try {
        const { username } = await context.params
        const target = await profileFromRoute(username, viewerId)
        if (!target) return NextResponse.json({ message: "No such profile" }, { status: 404 })
        if (target.id === viewerId) return NextResponse.json({ message: "You can't follow yourself" }, { status: 400 })

        const result = on
            ? await supabase.from("follows").upsert({ follower_id: viewerId, following_id: target.id }, { onConflict: "follower_id,following_id", ignoreDuplicates: true })
            : await supabase.from("follows").delete().eq("follower_id", viewerId).eq("following_id", target.id)
        if (result.error) throw result.error

        const [ counts, still ] = await Promise.all([
            supabase.from("profiles").select("followers_count").eq("id", target.id).single(),
            supabase.from("follows").select("follower_id", { head: true, count: "exact" }).eq("follower_id", viewerId).eq("following_id", target.id),
        ])
        return NextResponse.json({ following: (still.count ?? 0) > 0, followers: counts.data?.followers_count ?? 0 })
    } catch (e) {
        console.log("Error saving a follow: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't save that" }, { status: 500 })
    }
}
