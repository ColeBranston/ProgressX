import { supabase } from "@/app/supabaseClient/client";

export const WATER_GOAL_MIN_ML = 500
export const WATER_GOAL_MAX_ML = 6000 // matches the check constraint on user_settings.water_goal_ml

export type UserSettings = {
    blurProgressPhotos: boolean,
    waterGoalMl: number | null, // null = recommended goal
    profilePrivacy: "public" | "private",
}

// Reads the user's settings; a missing user_settings row means all defaults
export async function loadUserSettings(userId: string): Promise<{ settings: UserSettings, email: string | null }> {
    const [
        { data: row, error: settingsError },
        { data: profile, error: profileError },
    ] = await Promise.all([
        supabase.from("user_settings").select("blur_progress_photos, water_goal_ml").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("profile_privacy, email").eq("id", userId).single(),
    ])

    if (settingsError) throw settingsError
    if (profileError) throw profileError

    return {
        settings: {
            blurProgressPhotos: row?.blur_progress_photos ?? false,
            waterGoalMl: row?.water_goal_ml ?? null,
            profilePrivacy: profile?.profile_privacy === "public" ? "public" : "private",
        },
        email: profile?.email ?? null,
    }
}
