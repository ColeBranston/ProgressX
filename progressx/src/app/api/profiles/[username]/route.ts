import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { findProfileByUsername } from "../../libs/videos";

type PublicProfileRow = {
    id: string,
    display_username: string,
    display_name: string | null,
    profile_image: string | null,
    profile_bio: string | null,
    profile_privacy: string | null,
    followers_count: number | null,
    following_count: number | null,
    likes_count: number | null,
}

// route params usually arrive decoded already; a stray % must not throw
function safeDecode(value: string) {
    try { return decodeURIComponent(value) } catch { return value }
}

// GET /api/profiles/:username   -> { profile }  (with whether you follow each other)
// What anyone signed in can see about a profile: name, picture, bio and counts. Whether their videos
// show is up to their privacy setting (see /api/videos). Nothing else (email, age, body stats) is sent.
export async function GET(req: NextRequest, context: { params: Promise<{ username: string }> }) {
    const viewerId = await getUserIdFromRequest(req)
    if (!viewerId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { username } = await context.params
    try {
        const profile = await findProfileByUsername<PublicProfileRow>(
            safeDecode(username),
            "id, display_username, display_name, profile_image, profile_bio, profile_privacy, followers_count, following_count, likes_count",
        )
        if (!profile) return NextResponse.json({ message: "No such profile" }, { status: 404 })

        const isOwner = profile.id === viewerId
        const isPublic = profile.profile_privacy === "public"
        const [ { count }, following, followsYou ] = await Promise.all([
            isOwner || isPublic
                ? supabase.from("videos").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("status", "ready")
                : Promise.resolve({ count: null }),
            supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", viewerId).eq("following_id", profile.id),
            supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", profile.id).eq("following_id", viewerId),
        ])

        return NextResponse.json({
            profile: {
                username: profile.display_username,
                name: profile.display_name ?? "",
                pfp: profile.profile_image,
                bio: profile.profile_bio ?? "",
                privacy: isPublic ? "public" : "private",
                followers: profile.followers_count ?? 0,
                following: profile.following_count ?? 0,
                likes: profile.likes_count ?? 0,
                videos: count,
                isOwner,
                youFollow: (following.count ?? 0) > 0,
                followsYou: (followsYou.count ?? 0) > 0,
                listsVisible: isOwner || isPublic, // their followers / following lists
            },
        })
    } catch (e) {
        console.log("Error loading profile: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load that profile" }, { status: 500 })
    }
}
