import { supabase } from "@/app/supabaseClient/client";
import { NO_SHARING, SHARE_KINDS, ShareKind, Sharing } from "@/app/internal_components/profile/sharing";

// user_settings columns behind each "show on my profile" choice (all default to false)
export const SHARE_COLUMNS: Record<ShareKind, string> = {
    photos: "share_progress_photos",
    weight: "share_weight",
    workouts: "share_workouts",
    diet: "share_diet",
}

export const SHARE_SELECT = SHARE_KINDS.map((kind) => SHARE_COLUMNS[kind]).join(", ")

export function sharingFromRow(row: Record<string, unknown> | null | undefined): Sharing {
    return Object.fromEntries(SHARE_KINDS.map((kind) => [kind, row?.[SHARE_COLUMNS[kind]] === true])) as Sharing
}

// The user_settings update for the choices that were sent
export function sharingColumns(sharing: Partial<Sharing>): Record<string, boolean> {
    return Object.fromEntries(Object.entries(sharing).map(([kind, on]) => [SHARE_COLUMNS[kind as ShareKind], on]))
}

export async function loadSharing(userId: string): Promise<Sharing> {
    const { data, error } = await supabase.from("user_settings").select(SHARE_SELECT).eq("user_id", userId).maybeSingle()
    if (error) throw error
    return sharingFromRow(data as Record<string, unknown> | null)
}

// What this viewer may see of someone's tracking: everything when it's their own profile; otherwise only what
// the owner chose to show, only while their profile is public, and only to people who are signed in
export function visibleSharing(sharing: Sharing, viewer: { isOwner: boolean, signedIn: boolean, profilePublic: boolean }): Sharing {
    if (viewer.isOwner) return { photos: true, weight: true, workouts: true, diet: true }
    if (!viewer.signedIn || !viewer.profilePublic) return { ...NO_SHARING }
    return { ...sharing }
}
