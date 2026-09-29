import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { loadUserSettings, WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from "../../libs/userSettings";

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

// PATCH /api/user/settings  { blurProgressPhotos?, waterGoalMl?, profilePrivacy?, weightUnit? }
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

    let privacyUpdate: "public" | "private" | null = null
    if ("profilePrivacy" in body) {
        if (body.profilePrivacy !== "public" && body.profilePrivacy !== "private") {
            return NextResponse.json({ message: "profilePrivacy must be \"public\" or \"private\"" }, { status: 400 })
        }
        privacyUpdate = body.profilePrivacy
    }

    try {
        if (Object.keys(settingsUpdate).length > 0) {
            const { error } = await supabase
                .from("user_settings")
                .upsert({ user_id: userId, ...settingsUpdate, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
            if (error) throw error
        }

        if (privacyUpdate) {
            const { error } = await supabase.from("profiles").update({ profile_privacy: privacyUpdate }).eq("id", userId)
            if (error) throw error
        }

        return NextResponse.json(await loadUserSettings(userId))
    } catch (error) {
        console.log("Error saving settings: ", error)
        return NextResponse.json({ message: "Error saving settings" }, { status: 500 })
    }
}
