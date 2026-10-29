import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../../libs/helpers";
import { findProfileByUsername } from "../../../../libs/videos";
import { fetchAllPages, isDateString, readDateRange } from "../../../../libs/dateRange";
import { loadSharing, visibleSharing } from "../../../../libs/sharing";
import { isShareKind, ShareKind } from "@/app/internal_components/profile/sharing";
import { getCalorieTarget, getMacroTargets, getTotalExpenditure, weightKgFromProfile } from "@/app/internal_components/mydiet/dietTargets";
import type { goalType } from "@/app/internal_components/mydiet/CalorieTarget";

type OwnerRow = {
    id: string,
    profile_privacy: string | null,
    age: number | null,
    gender: string | null,
    height_cm: number | null,
    weight_lbs: number | null,
    activity_level: number | string | null,
}

const GOALS: goalType[] = ["Deficit", "Maintain", "Surplus"]

function safeDecode(value: string) {
    try { return decodeURIComponent(value) } catch { return value }
}

const notShared = () => NextResponse.json({ code: "not_shared", message: "This isn't shared" }, { status: 403 })

// GET /api/profiles/:username/tracking/:kind
//   photos                        -> { photos: [{ id, imageLink, description, createdAt }] }
//   weight?from&to   (YYYY-MM-DD) -> { entries: [{ date, period, weightKg }], weightUnit }
//   workouts?from&to (YYYY-MM-DD) -> { sets: [{ exerciseId, performedOn, weightKg, reps }], weightUnit }
//   diet?date        (YYYY-MM-DD) -> { date, entries: [...], targets: { calories, protein, carbs, fats, goal } }
// Someone's tracking, when they chose to show it on their public profile (see libs/sharing). Only for
// signed-in viewers; weightUnit is the viewer's own unit, for showing the weights.
export async function GET(req: NextRequest, context: { params: Promise<{ username: string, kind: string }> }) {
    const viewerId = await getUserIdFromRequest(req)
    if (!viewerId) return NextResponse.json({ message: "Log in to see this" }, { status: 401 })

    const { username, kind } = await context.params
    if (!isShareKind(kind)) return NextResponse.json({ message: "Unknown kind" }, { status: 404 })

    try {
        const owner = await findProfileByUsername<OwnerRow>(safeDecode(username), "id, profile_privacy, age, gender, height_cm, weight_lbs, activity_level")
        if (!owner) return NextResponse.json({ message: "No such profile" }, { status: 404 })

        const isOwner = owner.id === viewerId
        const visible = visibleSharing(isOwner ? { photos: true, weight: true, workouts: true, diet: true } : await loadSharing(owner.id), {
            isOwner, signedIn: true, profilePublic: owner.profile_privacy === "public",
        })
        if (!visible[kind]) return notShared()

        return await respond(kind, owner, viewerId, new URL(req.url).searchParams)
    } catch (e) {
        console.log(`Error loading shared ${kind}: `, e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load this" }, { status: 500 })
    }
}

async function viewerWeightUnit(viewerId: string): Promise<"lb" | "kg"> {
    const { data } = await supabase.from("user_settings").select("weight_unit").eq("user_id", viewerId).maybeSingle()
    return data?.weight_unit === "kg" ? "kg" : "lb"
}

async function respond(kind: ShareKind, owner: OwnerRow, viewerId: string, params: URLSearchParams): Promise<NextResponse> {
    if (kind === "photos") {
        const { data, error } = await supabase
            .from("photo_collection")
            .select("id, image_link, description, created_at")
            .eq("user_id", owner.id)
            .order("created_at", { ascending: false })
        if (error) throw error
        return NextResponse.json({
            photos: (data ?? []).map((row) => ({ id: row.id, imageLink: row.image_link, description: row.description, createdAt: row.created_at })),
        })
    }

    if (kind === "diet") {
        const date = params.get("date")
        if (!isDateString(date)) return NextResponse.json({ message: "date must be a YYYY-MM-DD date" }, { status: 400 })
        const [ { data: entries, error }, { data: config, error: configError } ] = await Promise.all([
            supabase
                .from("food_log_entries")
                .select("id, name, serving_qty, serving_unit, calories, protein_g, carbs_g, fats_g")
                .eq("user_id", owner.id)
                .eq("log_date", date)
                .order("created_at", { ascending: true }),
            supabase.from("diet_config").select("goal_state").eq("id", owner.id).maybeSingle(),
        ])
        if (error) throw error
        if (configError) throw configError

        // the same targets their diet page scores against
        const goal: goalType = GOALS.includes(config?.goal_state as goalType) ? config!.goal_state as goalType : "Maintain"
        const body = { weight: owner.weight_lbs, height: owner.height_cm, age: owner.age, gender: owner.gender, activity: owner.activity_level === null ? null : Number(owner.activity_level) }
        const totalExpenditure = getTotalExpenditure(body)
        const calories = getCalorieTarget(totalExpenditure, goal)
        return NextResponse.json({
            date,
            entries: (entries ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                servingQty: Number(row.serving_qty),
                servingUnit: row.serving_unit,
                calories: Number(row.calories) || 0,
                proteinG: Number(row.protein_g) || 0,
                carbsG: Number(row.carbs_g) || 0,
                fatsG: Number(row.fats_g) || 0,
            })),
            targets: calories > 0 ? { calories, goal, ...getMacroTargets(weightKgFromProfile(body), calories) } : null,
        })
    }

    const range = readDateRange(params, 400)
    if (!range) return NextResponse.json({ message: "from and to must be YYYY-MM-DD dates, at most 400 days apart" }, { status: 400 })

    if (kind === "weight") {
        const [ rows, weightUnit ] = await Promise.all([
            fetchAllPages((start, end) => supabase
                .from("weight_log_entries")
                .select("log_date, period, weight_kg")
                .eq("user_id", owner.id)
                .gte("log_date", range.from)
                .lte("log_date", range.to)
                .order("log_date", { ascending: true })
                .order("period", { ascending: true })
                .range(start, end)),
            viewerWeightUnit(viewerId),
        ])
        return NextResponse.json({
            entries: rows.map((row) => ({ date: row.log_date, period: row.period, weightKg: Number(row.weight_kg) })),
            weightUnit,
        })
    }

    const [ rows, weightUnit ] = await Promise.all([
        fetchAllPages((start, end) => supabase
            .from("workout_sets")
            .select("id, exercise_id, performed_on, weight_kg, reps")
            .eq("user_id", owner.id)
            .gte("performed_on", range.from)
            .lte("performed_on", range.to)
            .order("performed_on", { ascending: false })
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(start, end)),
        viewerWeightUnit(viewerId),
    ])
    return NextResponse.json({
        sets: rows.map((row) => ({ id: row.id, exerciseId: row.exercise_id, performedOn: row.performed_on, weightKg: Number(row.weight_kg), reps: row.reps })),
        weightUnit,
    })
}
