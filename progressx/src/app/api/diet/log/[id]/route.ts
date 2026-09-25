import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";

const UPDATABLE_FIELDS: Record<string, string> = {
    name: "name",
    servingQty: "serving_qty",
    servingUnit: "serving_unit",
    calories: "calories",
    proteinG: "protein_g",
    carbsG: "carbs_g",
    fatsG: "fats_g",
    fiberG: "fiber_g",
    micronutrients: "micronutrients",
    logDate: "log_date",
}

// PATCH /api/diet/log/[id]
// Edits an already-logged food item for a day. Scoped to the signed-in user
// via .eq("user_id", userId) so one user can't edit another's entries.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    try {
        const body = await req.json()

        const update: Record<string, unknown> = {}
        for (const [key, column] of Object.entries(UPDATABLE_FIELDS)) {
            if (key in body) update[column] = body[key]
        }
        update.updated_at = new Date().toISOString()

        const { data, error } = await supabase
            .from("food_log_entries")
            .update(update)
            .eq("id", id)
            .eq("user_id", userId)
            .select()
            .single()

        if (error) {
            console.log("Error updating food log entry: ", error)
            return NextResponse.json({ message: "Error updating food log entry" }, { status: 500 })
        }

        return NextResponse.json({ entry: data })
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.log("Error updating food log entry: ", error.message)
        return NextResponse.json({ message: `Error updating food log entry: ${error.message}` }, { status: 500 })
    }
}

// DELETE /api/diet/log/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const { error } = await supabase
        .from("food_log_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)

    if (error) {
        console.log("Error deleting food log entry: ", error)
        return NextResponse.json({ message: "Error deleting food log entry" }, { status: 500 })
    }

    return NextResponse.json({ message: "Deleted" })
}
