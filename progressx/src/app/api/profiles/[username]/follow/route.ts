import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { isFollowing, profileFromRoute } from "../../../libs/follows";
import { overLimit } from "../../../libs/videos";
import { requireVerified } from "../../../libs/requireVerified";

type Context = { params: Promise<{ username: string }> }

// PUT /api/profiles/:username/follow     -> follow them; for a private profile, ask to (a follow request)
// DELETE /api/profiles/:username/follow  -> unfollow, or take back a request
// Either way the answer is { following, requested, followers } (their new follower count)
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

        if (!on) {
            const [ unfollow, withdraw ] = await Promise.all([
                supabase.from("follows").delete().eq("follower_id", viewerId).eq("following_id", target.id),
                supabase.from("follow_requests").delete().eq("requester_id", viewerId).eq("target_id", target.id),
            ])
            if (unfollow.error) throw unfollow.error
            if (withdraw.error) throw withdraw.error
        } else if (target.profile_privacy === "public" || await isFollowing(viewerId, target.id)) {
            const { error } = await supabase.from("follows").upsert({ follower_id: viewerId, following_id: target.id }, { onConflict: "follower_id,following_id", ignoreDuplicates: true })
            if (error) throw error
        } else {
            // a private profile: its owner accepts or declines it from the requests on their profile
            const { error } = await supabase.from("follow_requests").upsert({ requester_id: viewerId, target_id: target.id }, { onConflict: "requester_id,target_id", ignoreDuplicates: true })
            if (error) throw error
        }

        const [ counts, still, pending ] = await Promise.all([
            supabase.from("profiles").select("followers_count").eq("id", target.id).single(),
            supabase.from("follows").select("follower_id", { head: true, count: "exact" }).eq("follower_id", viewerId).eq("following_id", target.id),
            supabase.from("follow_requests").select("requester_id", { head: true, count: "exact" }).eq("requester_id", viewerId).eq("target_id", target.id),
        ])
        return NextResponse.json({ following: (still.count ?? 0) > 0, requested: (pending.count ?? 0) > 0, followers: counts.data?.followers_count ?? 0 })
    } catch (e) {
        console.log("Error saving a follow: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't save that" }, { status: 500 })
    }
}
