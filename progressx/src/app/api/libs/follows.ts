import { supabase } from "@/app/supabaseClient/client";
import { findProfileByUsername } from "./videos";

// Following: anyone can follow anyone (there are no follow requests). Following someone whose profile
// is private doesn't show you their videos; private means only the owner sees them. Who follows whom
// is shown for public profiles, and always to the profile's owner.

export const FOLLOW_PAGE = 30

export type ProfileRef = { id: string, profile_privacy: string | null, display_username: string }

// The profile named in a route: a username, or "me" for the signed-in user (usernames have 3+ characters)
export async function profileFromRoute(username: string, viewerId: string): Promise<ProfileRef | null> {
    let name = username
    try { name = decodeURIComponent(username) } catch { /* already decoded */ }
    if (name === "me") {
        const { data, error } = await supabase.from("profiles").select("id, profile_privacy, display_username").eq("id", viewerId).maybeSingle()
        if (error) throw error
        return data as ProfileRef | null
    }
    return findProfileByUsername<ProfileRef>(name, "id, profile_privacy, display_username")
}

// Which of these people the viewer follows
export async function followingSet(viewerId: string, ids: string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)].filter((id) => id !== viewerId)
    if (!unique.length) return new Set()
    const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).in("following_id", unique)
    if (error) throw error
    return new Set((data ?? []).map((row) => row.following_id as string))
}

// Everyone the viewer follows (for the Following feed). Capped: past a few thousand this would move to
// a database-side join.
export async function followedIds(viewerId: string): Promise<string[]> {
    const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).limit(2000)
    if (error) throw error
    return (data ?? []).map((row) => row.following_id as string)
}

export type FollowListEntry = { username: string, name: string, pfp: string | null, privacy: "public" | "private", isOwner: boolean, following: boolean }

type FollowRow = { created_at: string, person: { id: string, display_username: string | null, display_name: string | null, profile_image: string | null, profile_privacy: string | null } | null }

// One page of someone's followers or of the people they follow, newest first
export async function followList(profileId: string, list: "followers" | "following", viewerId: string, offset: number) {
    const [ match, person ] = list === "followers" ? ["following_id", "follower_id"] : ["follower_id", "following_id"]
    const { data, error } = await supabase
        .from("follows")
        .select(`created_at, person:profiles!follows_${person}_fkey(id, display_username, display_name, profile_image, profile_privacy)`)
        .eq(match, profileId)
        .order("created_at", { ascending: false })
        .range(offset, offset + FOLLOW_PAGE)
    if (error) throw error

    const rows = ((data ?? []) as unknown as FollowRow[]).filter((row) => row.person?.display_username)
    const page = rows.slice(0, FOLLOW_PAGE)
    const viewerFollows = await followingSet(viewerId, page.map((row) => row.person!.id))
    return {
        people: page.map((row): FollowListEntry => ({
            username: row.person!.display_username!,
            name: row.person!.display_name ?? "",
            pfp: row.person!.profile_image,
            privacy: row.person!.profile_privacy === "public" ? "public" : "private",
            isOwner: row.person!.id === viewerId,
            following: viewerFollows.has(row.person!.id),
        })),
        nextCursor: (data ?? []).length > FOLLOW_PAGE ? String(offset + FOLLOW_PAGE) : null,
    }
}
