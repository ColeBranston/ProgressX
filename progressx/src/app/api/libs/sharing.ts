import { supabase } from "@/app/supabaseClient/client";
import { DEFAULT_AUDIENCES, isAudience, SHARE_KINDS, ShareAudiences, ShareKind, Sharing } from "@/app/internal_components/profile/sharing";

// user_settings columns holding each kind's audience ("only_me" by default)
export const SHARE_COLUMNS: Record<ShareKind, string> = {
    photos: "photos_audience",
    weight: "weight_audience",
    workouts: "workouts_audience",
    diet: "diet_audience",
}

export const SHARE_SELECT = SHARE_KINDS.map((kind) => SHARE_COLUMNS[kind]).join(", ")

export function audiencesFromRow(row: Record<string, unknown> | null | undefined): ShareAudiences {
    return Object.fromEntries(SHARE_KINDS.map((kind) => {
        const value = row?.[SHARE_COLUMNS[kind]]
        return [kind, isAudience(value) ? value : DEFAULT_AUDIENCES[kind]]
    })) as ShareAudiences
}

// The user_settings update for the audiences that were sent
export function audienceColumns(audiences: Partial<ShareAudiences>): Record<string, string> {
    return Object.fromEntries(Object.entries(audiences).map(([kind, audience]) => [SHARE_COLUMNS[kind as ShareKind], audience]))
}

export async function loadAudiences(userId: string): Promise<ShareAudiences> {
    const { data, error } = await supabase.from("user_settings").select(SHARE_SELECT).eq("user_id", userId).maybeSingle()
    if (error) throw error
    return audiencesFromRow(data as Record<string, unknown> | null)
}

type Viewer = { isOwner: boolean, signedIn: boolean, profilePublic: boolean, follows: boolean }

// What this viewer may open of someone's tracking: everything on their own profile; nothing for visitors who
// aren't signed in; otherwise what the owner chose for each kind. "everyone" reaches anyone signed in on a
// public profile, and only approved followers on a private one (nobody else can see a private profile).
export function visibleSharing(audiences: ShareAudiences, viewer: Viewer): Sharing {
    const can = (audience: ShareAudiences[ShareKind]) => {
        if (viewer.isOwner) return true
        if (!viewer.signedIn || audience === "only_me") return false
        if (audience === "followers") return viewer.follows
        return viewer.profilePublic || viewer.follows
    }
    return Object.fromEntries(SHARE_KINDS.map((kind) => [kind, can(audiences[kind])])) as Sharing
}
