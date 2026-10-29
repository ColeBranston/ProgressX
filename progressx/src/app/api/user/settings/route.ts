import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { loadUserSettings, WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from "../../libs/userSettings";
import { ACTIVITY_LEVELS } from "@/app/internal_components/profile/profileRules";
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo";
import { readAudiences } from "@/app/internal_components/profile/sharing";
import { audienceColumns } from "../../libs/sharing";
import { acceptFollowRequests } from "../../libs/follows";

// GET /api/user/settings
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    try {
        return NextResponse.json(await loadUserSettings(userId))
    } catch (error) {
        console.log("Error loading settings: ", error)
        return NextResponse.json({ message: "Error loading settings" }, { status: 500 })
    }
}

// PATCH /api/user/settings  { blurProgressPhotos?, waterGoalMl?, profilePrivacy?, weightUnit?, activityLevel?, personalizedAds?, sharing? }
// Only the fields sent are changed. Returns the full, saved settings.
export async function PATCH(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
        return NextResponse.json({ message: "Invalid request body" }, { status: 400 })
    }

    const settingsUpdate: Record<string, unknown> = {}

    if ("blurProgressPhotos" in body) {
        if (typeof body.blurProgressPhotos !== "boolean") {
            return NextResponse.json({ message: "blurProgressPhotos must be true or false" }, { status: 400 })
        }
        settingsUpdate.blur_progress_photos = body.blurProgressPhotos
    }

    if ("waterGoalMl" in body) {
        const goal = body.waterGoalMl
        const valid = goal === null || (Number.isInteger(goal) && goal >= WATER_GOAL_MIN_ML && goal <= WATER_GOAL_MAX_ML)
        if (!valid) {
            return NextResponse.json({ message: `waterGoalMl must be null or a whole number from ${WATER_GOAL_MIN_ML} to ${WATER_GOAL_MAX_ML}` }, { status: 400 })
        }
        settingsUpdate.water_goal_ml = goal
    }

    if ("weightUnit" in body) {
        if (body.weightUnit !== "lb" && body.weightUnit !== "kg") {
            return NextResponse.json({ message: "weightUnit must be \"lb\" or \"kg\"" }, { status: 400 })
        }
        settingsUpdate.weight_unit = body.weightUnit
    }

    // personalized ads are opt-in: every change is kept in the consent history
    if ("personalizedAds" in body) {
        if (typeof body.personalizedAds !== "boolean") {
            return NextResponse.json({ message: "personalizedAds must be true or false" }, { status: 400 })
        }
        settingsUpdate.personalized_ads = body.personalizedAds
    }

    // who sees each kind of tracking: { photos?, weight?, workouts?, diet? } of "only_me" | "followers" | "everyone"; only the ones sent change
    if ("sharing" in body) {
        const sharing = readAudiences(body.sharing)
        if (!sharing) {
            return NextResponse.json({ message: "sharing must be an object of photos, weight, workouts and diet set to only_me, followers or everyone" }, { status: 400 })
        }
        Object.assign(settingsUpdate, audienceColumns(sharing))
    }

    // these live on the profile rather than in user_settings
    const profileUpdate: Record<string, unknown> = {}

    if ("profilePrivacy" in body) {
        if (body.profilePrivacy !== "public" && body.profilePrivacy !== "private") {
            return NextResponse.json({ message: "profilePrivacy must be \"public\" or \"private\"" }, { status: 400 })
        }
        profileUpdate.profile_privacy = body.profilePrivacy
    }

    if ("activityLevel" in body) {
        if (!ACTIVITY_LEVELS.some((level) => level.value === body.activityLevel)) {
            return NextResponse.json({ message: "activityLevel must be a whole number from 1 to 5" }, { status: 400 })
        }
        profileUpdate.activity_level = body.activityLevel
    }

    try {
        if (Object.keys(settingsUpdate).length > 0) {
            const { error } = await supabase
                .from("user_settings")
                .upsert({ user_id: userId, ...settingsUpdate, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
            if (error) throw error
        }

        if (typeof body.personalizedAds === "boolean") {
            const { error } = await supabase.from("consent_events").insert({
                user_id: userId,
                terms_version: TERMS_VERSION,
                age_confirmed: false,
                source: body.personalizedAds ? "personalized_ads_on" : "personalized_ads_off",
                user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400) || null,
            })
            if (error) throw error
        }

        if (Object.keys(profileUpdate).length > 0) {
            const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", userId)
            if (error) throw error
            // a public profile can be followed by anyone, so whoever was waiting becomes a follower
            if (profileUpdate.profile_privacy === "public") await acceptFollowRequests(userId)
        }

        return NextResponse.json(await loadUserSettings(userId))
    } catch (error) {
        console.log("Error saving settings: ", error)
        return NextResponse.json({ message: "Error saving settings" }, { status: 500 })
    }
}
