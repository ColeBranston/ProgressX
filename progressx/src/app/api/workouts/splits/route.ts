import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { parseSplitDays, parseSplitName, SPLIT_COLUMNS } from "../../libs/workouts";

const MAX_SPLITS = 20

// GET /api/workouts/splits
// The signed-in user's workout splits, active one first.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
        .from("workout_splits")
        .select(SPLIT_COLUMNS)
        .eq("user_id", userId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true })

    if (error) {
        console.log("Error fetching workout splits: ", error)
        return NextResponse.json({ message: "Error fetching workout splits" }, { status: 500 })
    }

    return NextResponse.json({ splits: data })
}

// POST /api/workouts/splits  { name, days: [{ name, exercises: [{ exerciseId, sets, reps }] }] }
// Creates a split. The user's first split becomes the active one.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const name = parseSplitName(body?.name)
    if (!name) {
        return NextResponse.json({ message: "name must be 1 to 60 characters" }, { status: 400 })
    }

    const parsed = parseSplitDays(body?.days)
    if ("error" in parsed) {
        return NextResponse.json({ message: parsed.error }, { status: 400 })
    }

    const { count, error: countError } = await supabase
        .from("workout_splits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)

    if (countError) {
        console.log("Error counting workout splits: ", countError)
        return NextResponse.json({ message: "Error creating workout split" }, { status: 500 })
    }

    if ((count ?? 0) >= MAX_SPLITS) {
        return NextResponse.json({ message: `You can have up to ${MAX_SPLITS} splits` }, { status: 400 })
    }

    const { data, error } = await supabase
        .from("workout_splits")
        .insert({ user_id: userId, name, days: parsed.days, is_active: (count ?? 0) === 0 })
        .select(SPLIT_COLUMNS)
        .single()

    if (error) {
        console.log("Error creating workout split: ", error)
        return NextResponse.json({ message: "Error creating workout split" }, { status: 500 })
    }

    return NextResponse.json({ split: data }, { status: 201 })
}
