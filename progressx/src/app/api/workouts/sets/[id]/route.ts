import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { isUuid, parseReps, parseWeightKg, SET_COLUMNS } from "../../../libs/workouts";

type Params = { params: Promise<{ id: string }> }

// PATCH /api/workouts/sets/[id]  { weightKg?, reps? }
export async function PATCH(req: NextRequest, { params }: Params) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!isUuid(id)) {
        return NextResponse.json({ message: "Set not found" }, { status: 404 })
    }
    const body = await req.json().catch(() => null)
    const update: Record<string, number> = {}

    if (body && "weightKg" in body) {
        const weightKg = parseWeightKg(body.weightKg)
        if (weightKg === null) return NextResponse.json({ message: "weightKg must be 0 to 1000" }, { status: 400 })
        update.weight_kg = weightKg
    }

    if (body && "reps" in body) {
        const reps = parseReps(body.reps)
        if (reps === null) return NextResponse.json({ message: "reps must be a whole number from 1 to 600" }, { status: 400 })
        update.reps = reps
    }

    if (Object.keys(update).length === 0) {
        return NextResponse.json({ message: "Nothing to update" }, { status: 400 })
    }

    const { data, error } = await supabase
        .from("workout_sets")
        .update(update)
        .eq("id", id)
        .eq("user_id", userId)
        .select(SET_COLUMNS)
        .maybeSingle()

    if (error) {
        console.log("Error updating workout set: ", error)
        return NextResponse.json({ message: "Error updating set" }, { status: 500 })
    }

    if (!data) {
        return NextResponse.json({ message: "Set not found" }, { status: 404 })
    }

    return NextResponse.json({ set: data })
}

// DELETE /api/workouts/sets/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!isUuid(id)) {
        return NextResponse.json({ message: "Set not found" }, { status: 404 })
    }

    const { data, error } = await supabase
        .from("workout_sets")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id")

    if (error) {
        console.log("Error deleting workout set: ", error)
        return NextResponse.json({ message: "Error deleting set" }, { status: 500 })
    }

    if (!data || data.length === 0) {
        return NextResponse.json({ message: "Set not found" }, { status: 404 })
    }

    return NextResponse.json({ message: "Set deleted" })
}
