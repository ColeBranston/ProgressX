import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { usernameError, validateOnboarding } from "@/app/internal_components/profile/profileRules";

// Is this username free? Case-insensitive, and your own current username counts as free.
async function usernameTaken(username: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("display_username", username.replace(/[\\%_]/g, (c) => `\\${c}`)) // exact match, not a pattern
        .neq("id", userId)
        .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
}

// GET /api/user/onboarding?username=name  ->  { available: boolean, message? }
// Live check while typing a username.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const username = (new URL(req.url).searchParams.get("username") ?? "").trim()
    const problem = usernameError(username)
    if (problem) {
        return NextResponse.json({ available: false, message: problem })
    }

    try {
        const taken = await usernameTaken(username, userId)
        return NextResponse.json(taken ? { available: false, message: "That username is taken" } : { available: true })
    } catch (e) {
        console.log("Error checking username: ", e)
        return NextResponse.json({ message: "Couldn't check that username" }, { status: 500 })
    }
}

// POST /api/user/onboarding  { username, name, age, gender, heightCm, weightLbs, activity, weightUnit? }
// Saves the profile details and marks onboarding complete. Problems come back per field:
// 400 { message, errors: { field: message } }, or 409 when the username was taken meanwhile.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Your session has ended. Please log in again." }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
        return NextResponse.json({ message: "Invalid request" }, { status: 400 })
    }

    const details = {
        username: String(body.username ?? "").trim(),
        name: String(body.name ?? "").trim(),
        age: Number(body.age),
        gender: body.gender,
        heightCm: Number(body.heightCm),
        weightLbs: Number(body.weightLbs),
        activity: Number(body.activity),
    }
    const errors = validateOnboarding(details)
    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ message: "Some details need fixing", errors }, { status: 400 })
    }

    try {
        if (await usernameTaken(details.username, userId)) {
            return NextResponse.json({ message: "That username is taken", errors: { username: "That username is taken" } }, { status: 409 })
        }

        const { error } = await supabase.from("profiles").update({
            display_username: details.username,
            display_name: details.name,
            age: details.age,
            gender: details.gender,
            height_cm: Math.round(details.heightCm),
            weight_lbs: Math.round(details.weightLbs),
            activity_level: details.activity,
            isOnboarded: true,
        }).eq("id", userId)

        if (error) {
            // the unique index catches a username claimed between the check and the save
            if (error.code === "23505") {
                return NextResponse.json({ message: "That username is taken", errors: { username: "That username is taken" } }, { status: 409 })
            }
            throw error
        }

        // the unit they entered their weight in becomes their default for workouts
        if (body.weightUnit === "lb" || body.weightUnit === "kg") {
            const { error: settingsError } = await supabase
                .from("user_settings")
                .upsert({ user_id: userId, weight_unit: body.weightUnit, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
            if (settingsError) console.log("Couldn't save weight unit at onboarding: ", settingsError.message)
        }

        return NextResponse.json({ message: "Profile saved" }, { status: 201 })
    } catch (e) {
        console.log("Error saving onboarding details: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't save your details. Please try again." }, { status: 500 })
    }
}
