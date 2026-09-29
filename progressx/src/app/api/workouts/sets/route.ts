import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { fetchAllPages, isDateString, readDateRange } from "../../libs/dateRange";
import { isUuid, parseReps, parseWeightKg, SET_COLUMNS } from "../../libs/workouts";
import { isExerciseId } from "@/app/internal_components/mystats/exercises";

// GET /api/workouts/sets?from=YYYY-MM-DD&to=YYYY-MM-DD
// Every set the user logged in the range (inclusive), oldest first.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const range = readDateRange(new URL(req.url).searchParams, 800)
    if (!range) {
        return NextResponse.json({ message: "from and to must be YYYY-MM-DD dates, at most 800 days apart" }, { status: 400 })
    }

    try {
        const sets = await fetchAllPages((start, end) => supabase
            .from("workout_sets")
            .select(SET_COLUMNS)
            .eq("user_id", userId)
            .gte("performed_on", range.from)
            .lte("performed_on", range.to)
            .order("performed_on", { ascending: true })
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(start, end))

        return NextResponse.json({ sets })
    } catch (error) {
        console.log("Error fetching workout sets: ", error)
        return NextResponse.json({ message: "Error fetching workout sets" }, { status: 500 })
    }
}

// POST /api/workouts/sets  { exerciseId, performedOn, weightKg, reps, splitId?, splitDayIndex? }
// Logs one set. Weight is always sent in kg (the page converts from the user's unit).
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)

    if (!isExerciseId(body?.exerciseId)) {
        return NextResponse.json({ message: "Unknown exerciseId" }, { status: 400 })
    }

    if (!isDateString(body?.performedOn)) {
        return NextResponse.json({ message: "performedOn must be a YYYY-MM-DD date" }, { status: 400 })
    }

    const weightKg = parseWeightKg(body?.weightKg)
    const reps = parseReps(body?.reps)
    if (weightKg === null || reps === null) {
        return NextResponse.json({ message: "weightKg must be 0 to 1000 and reps a whole number from 1 to 600" }, { status: 400 })
    }

    let splitId: string | null = null
    let splitDayIndex: number | null = null
    if (isUuid(body?.splitId)) {
        // only link to one of the user's own splits
        const { data: split, error: splitError } = await supabase
            .from("workout_splits")
            .select("id, days")
            .eq("id", body.splitId)
            .eq("user_id", userId)
            .maybeSingle()

        if (splitError) {
            console.log("Error checking workout split: ", splitError)
            return NextResponse.json({ message: "Error logging set" }, { status: 500 })
        }

        const dayIndex = Number(body.splitDayIndex)
        if (split && Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex < (split.days as unknown[]).length) {
            splitId = split.id
            splitDayIndex = dayIndex
        }
    }

    const { data, error } = await supabase
        .from("workout_sets")
        .insert({
            user_id: userId,
            exercise_id: body.exerciseId,
            performed_on: body.performedOn,
            weight_kg: weightKg,
            reps,
            split_id: splitId,
            split_day_index: splitDayIndex,
        })
        .select(SET_COLUMNS)
        .single()

    if (error) {
        console.log("Error logging workout set: ", error)
        return NextResponse.json({ message: "Error logging set" }, { status: 500 })
    }

    return NextResponse.json({ set: data }, { status: 201 })
}
