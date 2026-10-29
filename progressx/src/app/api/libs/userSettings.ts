import { supabase } from "@/app/supabaseClient/client";
import type { ShareAudiences } from "@/app/internal_components/profile/sharing";
import { SHARE_SELECT, audiencesFromRow } from "./sharing";

export const WATER_GOAL_MIN_ML = 500
export const WATER_GOAL_MAX_ML = 6000 // matches the check constraint on user_settings.water_goal_ml

export type UserSettings = {
    blurProgressPhotos: boolean,
    waterGoalMl: number | null, // null = recommended goal
    profilePrivacy: "public" | "private",
    weightUnit: "lb" | "kg", // how workout weights are shown and entered (stored in kg)
    activityLevel: number | null, // profiles.activity_level 1..5, drives the calorie and water targets
    personalizedAds: boolean, // opted in to personalized ads (off unless they turn it on)
    sharing: ShareAudiences, // who sees each kind of their tracking on their profile (only them unless they choose otherwise)
}

// Reads the user's settings; a missing user_settings row means all defaults
export async function loadUserSettings(userId: string): Promise<{ settings: UserSettings, email: string | null }> {
    const [
        { data: settingsRow, error: settingsError },
        { data: profile, error: profileError },
    ] = await Promise.all([
        supabase.from("user_settings").select(`blur_progress_photos, water_goal_ml, weight_unit, personalized_ads, ${SHARE_SELECT}`).eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("profile_privacy, email, activity_level").eq("id", userId).single(),
    ])

    if (settingsError) throw settingsError
    if (profileError) throw profileError
    // the select is built from SHARE_SELECT, so the client can't type the row
    const row = settingsRow as { blur_progress_photos?: boolean, water_goal_ml?: number | null, weight_unit?: string, personalized_ads?: boolean } | null

    return {
        settings: {
            blurProgressPhotos: row?.blur_progress_photos ?? false,
            waterGoalMl: row?.water_goal_ml ?? null,
            profilePrivacy: profile?.profile_privacy === "public" ? "public" : "private",
            weightUnit: row?.weight_unit === "kg" ? "kg" : "lb",
            activityLevel: profile?.activity_level ?? null,
            personalizedAds: row?.personalized_ads === true,
            sharing: audiencesFromRow(row as Record<string, unknown> | null),
        },
        email: profile?.email ?? null,
    }
}
