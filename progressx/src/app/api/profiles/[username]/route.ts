import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { findProfileByUsername } from "../../libs/videos";
import { loadAudiences, visibleSharing } from "../../libs/sharing";
import { DEFAULT_AUDIENCES } from "@/app/internal_components/profile/sharing";

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
// What anyone can see about a profile, signed in or not: name, picture, bio and counts. Whether their videos
// show is up to their privacy setting: everyone for a public profile, approved followers for a private one. Nothing else (email, age, body stats) is sent;
// `shared` says which of their tracking this viewer may open (see ./tracking/[kind]).
export async function GET(req: NextRequest, context: { params: Promise<{ username: string }> }) {
    const viewerId = await getUserIdFromRequest(req) // null: not signed in

    const { username } = await context.params
    try {
        const profile = await findProfileByUsername<PublicProfileRow>(
            safeDecode(username),
            "id, display_username, display_name, profile_image, profile_bio, profile_privacy, followers_count, following_count, likes_count",
        )
        if (!profile) return NextResponse.json({ message: "No such profile" }, { status: 404 })
        // visitors who aren't signed in only see public profiles (a private one looks like it doesn't exist)
        if (!viewerId && profile.profile_privacy !== "public") return NextResponse.json({ message: "No such profile" }, { status: 404 })

        const isOwner = viewerId !== null && profile.id === viewerId
        const isPublic = profile.profile_privacy === "public"
        const [ following, followsYou, pending, audiences ] = await Promise.all([
            viewerId ? supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", viewerId).eq("following_id", profile.id) : Promise.resolve({ count: 0 }),
            viewerId ? supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", profile.id).eq("following_id", viewerId) : Promise.resolve({ count: 0 }),
            viewerId ? supabase.from("follow_requests").select("requester_id", { count: "exact", head: true }).eq("requester_id", viewerId).eq("target_id", profile.id) : Promise.resolve({ count: 0 }),
            // only signed-in people ever see tracking, so there's nothing to look up for anyone else
            viewerId && !isOwner ? loadAudiences(profile.id) : null,
        ])
        const youFollow = (following.count ?? 0) > 0
        // a private profile's videos and lists are for its approved followers
        const canSee = isOwner || isPublic || youFollow
        const { count } = canSee
            ? await supabase.from("videos").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("status", "ready")
            : { count: null }

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
                youFollow,
                requested: (pending.count ?? 0) > 0, // asked to follow this private profile, waiting on them
                followsYou: (followsYou.count ?? 0) > 0,
                canSee, // their videos
                listsVisible: canSee, // their followers / following lists
                shared: visibleSharing(audiences ?? DEFAULT_AUDIENCES, { isOwner: false, signedIn: viewerId !== null, profilePublic: isPublic, follows: youFollow }),
            },
        })
    } catch (e) {
        console.log("Error loading profile: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load that profile" }, { status: 500 })
    }
}
