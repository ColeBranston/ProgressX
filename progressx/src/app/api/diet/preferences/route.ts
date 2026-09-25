import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { ALL_MICRONUTRIENT_NAMES } from "@/app/internal_components/mydiet/microNutrients";

const GOAL_STATES = ["Deficit", "Maintain", "Surplus"] as const
type GoalState = typeof GOAL_STATES[number]

// GET /api/diet/preferences
// Returns which micronutrients the user has chosen to display in the Micros
// analytics list, plus their saved calorie goal state (Deficit/Maintain/
// Surplus), used as the diet page's base state on load. Falls back to
// sensible defaults if the user hasn't saved a preference yet (diet_config
// row may not exist for them at all).
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
        .from("diet_config")
        .select("displayed_micronutrients, goal_state")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        console.log("Error fetching diet preferences: ", error)
        return NextResponse.json({ message: "Error fetching diet preferences" }, { status: 500 })
    }

    return NextResponse.json({
        displayedMicronutrients: data?.displayed_micronutrients ?? ALL_MICRONUTRIENT_NAMES,
        goalState: (data?.goal_state as GoalState | undefined) ?? "Maintain",
    })
}

// POST /api/diet/preferences
// Upserts the user's diet_config row. Accepts either or both of
// displayedMicronutrients and goalState, so the goal-state dial can save
// independently of the micronutrient display settings. Unknown/invalid
// values are dropped rather than rejecting the whole request.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    try {
        const { displayedMicronutrients, goalState } = await req.json()

        if (displayedMicronutrients !== undefined && !Array.isArray(displayedMicronutrients)) {
            return NextResponse.json({ message: "displayedMicronutrients must be an array" }, { status: 400 })
        }

        if (goalState !== undefined && !GOAL_STATES.includes(goalState)) {
            return NextResponse.json({ message: "goalState must be one of Deficit, Maintain, Surplus" }, { status: 400 })
        }

        const update: Record<string, unknown> = { id: userId }

        if (Array.isArray(displayedMicronutrients)) {
            update.displayed_micronutrients = displayedMicronutrients.filter(
                (name: unknown) => typeof name === "string" && ALL_MICRONUTRIENT_NAMES.includes(name)
            )
        }

        if (goalState !== undefined) {
            update.goal_state = goalState
        }

        const { data, error } = await supabase
            .from("diet_config")
            .upsert(update, { onConflict: "id" })
            .select("displayed_micronutrients, goal_state")
            .single()

        if (error) {
            console.log("Error updating diet preferences: ", error)
            return NextResponse.json({ message: "Error updating diet preferences" }, { status: 500 })
        }

        return NextResponse.json({
            displayedMicronutrients: data.displayed_micronutrients,
            goalState: data.goal_state,
        })
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.log("Error updating diet preferences: ", error.message)
        return NextResponse.json({ message: `Error updating diet preferences: ${error.message}` }, { status: 500 })
    }
}
