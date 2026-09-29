import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { isUuid, parseSplitDays, parseSplitName, SPLIT_COLUMNS } from "../../../libs/workouts";

type Params = { params: Promise<{ id: string }> }

// PATCH /api/workouts/splits/[id]  { name?, days?, isActive?: true }
// Edits a split, and/or makes it the active one (which deactivates the others).
export async function PATCH(req: NextRequest, { params }: Params) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!isUuid(id)) {
        return NextResponse.json({ message: "Workout split not found" }, { status: 404 })
    }
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
        return NextResponse.json({ message: "Invalid request body" }, { status: 400 })
    }

    const update: Record<string, unknown> = {}

    if ("name" in body) {
        const name = parseSplitName(body.name)
        if (!name) return NextResponse.json({ message: "name must be 1 to 60 characters" }, { status: 400 })
        update.name = name
    }

    if ("days" in body) {
        const parsed = parseSplitDays(body.days)
        if ("error" in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 })
        update.days = parsed.days
    }

    if ("isActive" in body && body.isActive !== true) {
        return NextResponse.json({ message: "isActive can only be set to true (activate another split to switch)" }, { status: 400 })
    }

    const { data: existing, error: findError } = await supabase
        .from("workout_splits")
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle()

    if (findError) {
        console.log("Error finding workout split: ", findError)
        return NextResponse.json({ message: "Error updating workout split" }, { status: 500 })
    }

    if (!existing) {
        return NextResponse.json({ message: "Workout split not found" }, { status: 404 })
    }

    if (body.isActive === true) {
        // only one active split per user (unique index), so clear the current one first
        const { error: clearError } = await supabase
            .from("workout_splits")
            .update({ is_active: false })
            .eq("user_id", userId)
            .eq("is_active", true)
            .neq("id", id)

        if (clearError) {
            console.log("Error deactivating workout splits: ", clearError)
            return NextResponse.json({ message: "Error updating workout split" }, { status: 500 })
        }

        update.is_active = true
    }

    const { data, error } = await supabase
        .from("workout_splits")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .select(SPLIT_COLUMNS)
        .single()

    if (error) {
        console.log("Error updating workout split: ", error)
        return NextResponse.json({ message: "Error updating workout split" }, { status: 500 })
    }

    return NextResponse.json({ split: data })
}

// DELETE /api/workouts/splits/[id]
// Deletes a split. Logged sets are kept (their split link is cleared by the foreign key).
export async function DELETE(req: NextRequest, { params }: Params) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!isUuid(id)) {
        return NextResponse.json({ message: "Workout split not found" }, { status: 404 })
    }

    const { data, error } = await supabase
        .from("workout_splits")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id, is_active")

    if (error) {
        console.log("Error deleting workout split: ", error)
        return NextResponse.json({ message: "Error deleting workout split" }, { status: 500 })
    }

    if (!data || data.length === 0) {
        return NextResponse.json({ message: "Workout split not found" }, { status: 404 })
    }

    return NextResponse.json({ message: "Workout split deleted" })
}
