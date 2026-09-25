import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";

// GET /api/diet/log?date=YYYY-MM-DD
// Returns the signed-in user's food log entries for the given day (defaults to today).
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const logDate = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
        .from("food_log_entries")
        .select("*")
        .eq("user_id", userId)
        .eq("log_date", logDate)
        .order("created_at", { ascending: true })

    if (error) {
        console.log("Error fetching food log entries: ", error)
        return NextResponse.json({ message: "Error fetching food log entries" }, { status: 500 })
    }

    return NextResponse.json({ entries: data })
}

// POST /api/diet/log
// Adds a food item to a day's log. Body carries the full macro + micronutrient
// breakdown for the serving as logged (a snapshot, so later edits to a saved
// food_items row don't rewrite history). Optionally links back to a food_items
// row (foodItemId, for "quick add" re-adds) and/or saves a new catalog entry
// (saveToCatalog) so the item can be quick-added again later.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const {
            name,
            servingQty = 1,
            servingUnit = "serving",
            calories = 0,
            proteinG = 0,
            carbsG = 0,
            fatsG = 0,
            fiberG = 0,
            micronutrients = {},
            logDate,
            foodItemId = null,
            saveToCatalog = false,
        } = body

        if (!name) {
            return NextResponse.json({ message: "name is required" }, { status: 400 })
        }

        const { data, error } = await supabase
            .from("food_log_entries")
            .insert({
                user_id: userId,
                food_item_id: foodItemId,
                log_date: logDate ?? new Date().toISOString().slice(0, 10),
                name,
                serving_qty: servingQty,
                serving_unit: servingUnit,
                calories,
                protein_g: proteinG,
                carbs_g: carbsG,
                fats_g: fatsG,
                fiber_g: fiberG,
                micronutrients,
            })
            .select()
            .single()

        if (error) {
            console.log("Error inserting food log entry: ", error)
            return NextResponse.json({ message: "Error adding food log entry" }, { status: 500 })
        }

        if (saveToCatalog) {
            const { error: catalogError } = await supabase.from("food_items").insert({
                user_id: userId,
                name,
                serving_size: servingQty,
                serving_unit: servingUnit,
                calories,
                protein_g: proteinG,
                carbs_g: carbsG,
                fats_g: fatsG,
                fiber_g: fiberG,
                micronutrients,
            })

            // Not fatal to the log entry itself - the item was still logged for
            // the day, it just didn't get saved to the quick-add catalog.
            if (catalogError) {
                console.log("Error saving food item to catalog: ", catalogError)
            }
        }

        return NextResponse.json({ entry: data }, { status: 201 })
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.log("Error adding food log entry: ", error.message)
        return NextResponse.json({ message: `Error adding food log entry: ${error.message}` }, { status: 500 })
    }
}
