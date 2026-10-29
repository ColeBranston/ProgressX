import { supabase } from "@/app/supabaseClient/client";
import { findProfileByUsername } from "./videos";

// Following, like TikTok: a public profile can be followed straight away; following a private one sends a
// follow request (follow_requests) that its owner accepts or declines, so everyone in `follows` for a
// private profile was approved. A private profile's videos and its followers / following lists are seen by
// its approved followers (and the owner); a public profile's by anyone.

export const FOLLOW_PAGE = 30

export type ProfileRef = { id: string, profile_privacy: string | null, display_username: string }

// The profile named in a route: a username, or "me" for the signed-in user (usernames have 3+ characters).
// viewerId is null for a visitor who isn't signed in, who has no "me".
export async function profileFromRoute(username: string, viewerId: string | null): Promise<ProfileRef | null> {
    let name = username
    try { name = decodeURIComponent(username) } catch { /* already decoded */ }
    if (name === "me") {
        if (!viewerId) return null
        const { data, error } = await supabase.from("profiles").select("id, profile_privacy, display_username").eq("id", viewerId).maybeSingle()
        if (error) throw error
        return data as ProfileRef | null
    }
    return findProfileByUsername<ProfileRef>(name, "id, profile_privacy, display_username")
}

// Which of these people the viewer follows
export async function followingSet(viewerId: string | null, ids: string[]): Promise<Set<string>> {
    if (!viewerId) return new Set()
    const unique = [...new Set(ids)].filter((id) => id !== viewerId)
    if (!unique.length) return new Set()
    const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).in("following_id", unique)
    if (error) throw error
    return new Set((data ?? []).map((row) => row.following_id as string))
}

// Whether the viewer follows (for a private profile: was approved by) this person
export async function isFollowing(viewerId: string | null, personId: string): Promise<boolean> {
    return (await followingSet(viewerId, [personId])).has(personId)
}

// Which of these people the viewer has asked to follow and is waiting on
export async function requestedSet(viewerId: string | null, ids: string[]): Promise<Set<string>> {
    if (!viewerId) return new Set()
    const unique = [...new Set(ids)].filter((id) => id !== viewerId)
    if (!unique.length) return new Set()
    const { data, error } = await supabase.from("follow_requests").select("target_id").eq("requester_id", viewerId).in("target_id", unique)
    if (error) throw error
    return new Set((data ?? []).map((row) => row.target_id as string))
}

// Whether the viewer may see a profile's videos and follow lists: the owner, anyone for a public profile,
// approved followers for a private one
export async function canSeeProfile(viewerId: string | null, profile: { id: string, profile_privacy: string | null }): Promise<boolean> {
    if (viewerId && profile.id === viewerId) return true
    if (profile.profile_privacy === "public") return true
    return isFollowing(viewerId, profile.id)
}

// Accepts follow requests to this person: the ones from requesterIds, or all of them (when their profile goes
// public). Returns how many became followers.
export async function acceptFollowRequests(targetId: string, requesterIds?: string[]): Promise<number> {
    let query = supabase.from("follow_requests").select("requester_id").eq("target_id", targetId)
    if (requesterIds) query = query.in("requester_id", requesterIds)
    const { data, error } = await query
    if (error) throw error
    const ids = (data ?? []).map((row) => row.requester_id as string)
    if (!ids.length) return 0
    const { error: followError } = await supabase.from("follows")
        .upsert(ids.map((id) => ({ follower_id: id, following_id: targetId })), { onConflict: "follower_id,following_id", ignoreDuplicates: true })
    if (followError) throw followError
    const { error: deleteError } = await supabase.from("follow_requests").delete().eq("target_id", targetId).in("requester_id", ids)
    if (deleteError) throw deleteError
    return ids.length
}

// Everyone the viewer follows (for the Following feed). Capped: past a few thousand this would move to
// a database-side join.
export async function followedIds(viewerId: string): Promise<string[]> {
    const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).limit(2000)
    if (error) throw error
    return (data ?? []).map((row) => row.following_id as string)
}

export type FollowListEntry = { username: string, name: string, pfp: string | null, privacy: "public" | "private", isOwner: boolean, following: boolean, requested: boolean }

type FollowRow = { created_at: string, person: { id: string, display_username: string | null, display_name: string | null, profile_image: string | null, profile_privacy: string | null } | null }

// One page of someone's followers or of the people they follow, newest first
export async function followList(profileId: string, list: "followers" | "following", viewerId: string | null, offset: number) {
    const [ match, person ] = list === "followers" ? ["following_id", "follower_id"] : ["follower_id", "following_id"]
    const { data, error } = await supabase
        .from("follows")
        .select(`created_at, person:profiles!follows_${person}_fkey(id, display_username, display_name, profile_image, profile_privacy)`)
        .eq(match, profileId)
        .order("created_at", { ascending: false })
        .range(offset, offset + FOLLOW_PAGE)
    if (error) throw error

    // visitors who aren't signed in only see the people in the list whose profiles are public
    const rows = ((data ?? []) as unknown as FollowRow[]).filter((row) => row.person?.display_username && (viewerId || row.person.profile_privacy === "public"))
    const page = rows.slice(0, FOLLOW_PAGE)
    const ids = page.map((row) => row.person!.id)
    const [ viewerFollows, viewerRequested ] = await Promise.all([followingSet(viewerId, ids), requestedSet(viewerId, ids)])
    return {
        people: page.map((row): FollowListEntry => ({
            username: row.person!.display_username!,
            name: row.person!.display_name ?? "",
            pfp: row.person!.profile_image,
            privacy: row.person!.profile_privacy === "public" ? "public" : "private",
            isOwner: viewerId !== null && row.person!.id === viewerId,
            following: viewerFollows.has(row.person!.id),
            requested: viewerRequested.has(row.person!.id),
        })),
        nextCursor: (data ?? []).length > FOLLOW_PAGE ? String(offset + FOLLOW_PAGE) : null,
    }
}
