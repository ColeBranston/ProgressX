import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { fetchAllPages, readDateRange } from "../../libs/dateRange";
import { ALL_MICRONUTRIENT_NAMES } from "@/app/internal_components/mydiet/microNutrients";

type FoodRow = {
    log_date: string,
    calories: number | string | null,
    protein_g: number | string | null,
    carbs_g: number | string | null,
    fats_g: number | string | null,
    micronutrients: Record<string, unknown> | null,
}

type WaterRow = { log_date: string, amount_ml: number | null }

type DayTotals = {
    date: string,
    foods: number,
    calories: number,
    protein: number,
    carbs: number,
    fats: number,
    micronutrients: Record<string, number>,
    waterMl: number,
}

const round1 = (n: number) => Math.round(n * 10) / 10

// GET /api/stats/diet?from=YYYY-MM-DD&to=YYYY-MM-DD
// Per-day food and water totals for the range (only days with something logged), plus the settings
// the diet page scores against: saved goal state, displayed micronutrients and custom water goal.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const range = readDateRange(new URL(req.url).searchParams)
    if (!range) {
        return NextResponse.json({ message: "from and to must be YYYY-MM-DD dates, at most 400 days apart" }, { status: 400 })
    }

    try {
        const [ food, water, { data: config, error: configError }, { data: settings, error: settingsError } ] = await Promise.all([
            fetchAllPages<FoodRow>((start, end) => supabase
                .from("food_log_entries")
                .select("log_date, calories, protein_g, carbs_g, fats_g, micronutrients")
                .eq("user_id", userId)
                .gte("log_date", range.from)
                .lte("log_date", range.to)
                .order("id")
                .range(start, end)),
            fetchAllPages<WaterRow>((start, end) => supabase
                .from("water_log_entries")
                .select("log_date, amount_ml")
                .eq("user_id", userId)
                .gte("log_date", range.from)
                .lte("log_date", range.to)
                .order("id")
                .range(start, end)),
            supabase.from("diet_config").select("displayed_micronutrients, goal_state").eq("id", userId).maybeSingle(),
            supabase.from("user_settings").select("water_goal_ml").eq("user_id", userId).maybeSingle(),
        ])

        if (configError) throw configError
        if (settingsError) throw settingsError

        const days = new Map<string, DayTotals>()
        const day = (date: string) => {
            let totals = days.get(date)
            if (!totals) {
                totals = { date, foods: 0, calories: 0, protein: 0, carbs: 0, fats: 0, micronutrients: {}, waterMl: 0 }
                days.set(date, totals)
            }
            return totals
        }

        for (const row of food) {
            const totals = day(row.log_date)
            totals.foods += 1
            totals.calories += Number(row.calories) || 0
            totals.protein += Number(row.protein_g) || 0
            totals.carbs += Number(row.carbs_g) || 0
            totals.fats += Number(row.fats_g) || 0
            for (const [name, amount] of Object.entries(row.micronutrients ?? {})) {
                totals.micronutrients[name] = (totals.micronutrients[name] ?? 0) + (Number(amount) || 0)
            }
        }

        for (const row of water) {
            day(row.log_date).waterMl += Number(row.amount_ml) || 0
        }

        const sorted = Array.from(days.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((totals) => ({
                ...totals,
                calories: round1(totals.calories),
                protein: round1(totals.protein),
                carbs: round1(totals.carbs),
                fats: round1(totals.fats),
                micronutrients: Object.fromEntries(Object.entries(totals.micronutrients).map(([name, amount]) => [name, round1(amount)])),
            }))

        return NextResponse.json({
            from: range.from,
            to: range.to,
            days: sorted,
            goalState: config?.goal_state ?? "Maintain",
            displayedMicronutrients: config?.displayed_micronutrients ?? ALL_MICRONUTRIENT_NAMES,
            customWaterGoalMl: settings?.water_goal_ml ?? null,
        })
    } catch (error) {
        console.log("Error loading diet stats: ", error)
        return NextResponse.json({ message: "Error loading diet stats" }, { status: 500 })
    }
}
