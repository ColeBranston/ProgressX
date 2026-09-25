import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";

// GET /api/diet/food-items?search=chicken
// Lists the signed-in user's personal food catalog (previously logged items),
// used to power "Quick Add" on the diet page.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")

    let query = supabase
        .from("food_items")
        .select("*")
        .eq("user_id", userId)
        .order("name", { ascending: true })

    if (search) {
        query = query.ilike("name", `%${search}%`)
    }

    const { data, error } = await query

    if (error) {
        console.log("Error fetching food items: ", error)
        return NextResponse.json({ message: "Error fetching food items" }, { status: 500 })
    }

    return NextResponse.json({ items: data })
}

// POST /api/diet/food-items
// Saves a new item to the user's personal catalog directly (independent of
// logging it to a specific day - the diet page also offers this via the
// "save to my food catalog" option when adding/editing a log entry).
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const {
            name,
            servingSize = 1,
            servingUnit = "serving",
            calories = 0,
            proteinG = 0,
            carbsG = 0,
            fatsG = 0,
            fiberG = 0,
            micronutrients = {},
        } = body

        if (!name) {
            return NextResponse.json({ message: "name is required" }, { status: 400 })
        }

        const { data, error } = await supabase
            .from("food_items")
            .insert({
                user_id: userId,
                name,
                serving_size: servingSize,
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
            console.log("Error creating food item: ", error)
            return NextResponse.json({ message: "Error creating food item" }, { status: 500 })
        }

        return NextResponse.json({ item: data }, { status: 201 })
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.log("Error creating food item: ", error.message)
        return NextResponse.json({ message: `Error creating food item: ${error.message}` }, { status: 500 })
    }
}
