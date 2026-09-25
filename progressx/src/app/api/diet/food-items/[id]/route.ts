import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";

const UPDATABLE_FIELDS: Record<string, string> = {
    name: "name",
    servingSize: "serving_size",
    servingUnit: "serving_unit",
    calories: "calories",
    proteinG: "protein_g",
    carbsG: "carbs_g",
    fatsG: "fats_g",
    fiberG: "fiber_g",
    micronutrients: "micronutrients",
}

// PATCH /api/diet/food-items/[id] - edit a saved catalog item's defaults
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
            .from("food_items")
            .update(update)
            .eq("id", id)
            .eq("user_id", userId)
            .select()
            .single()

        if (error) {
            console.log("Error updating food item: ", error)
            return NextResponse.json({ message: "Error updating food item" }, { status: 500 })
        }

        return NextResponse.json({ item: data })
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.log("Error updating food item: ", error.message)
        return NextResponse.json({ message: `Error updating food item: ${error.message}` }, { status: 500 })
    }
}

// DELETE /api/diet/food-items/[id] - remove a saved catalog item
// (existing food_log_entries keep their snapshot; food_item_id just goes null)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const { error } = await supabase
        .from("food_items")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)

    if (error) {
        console.log("Error deleting food item: ", error)
        return NextResponse.json({ message: "Error deleting food item" }, { status: 500 })
    }

    return NextResponse.json({ message: "Deleted" })
}
