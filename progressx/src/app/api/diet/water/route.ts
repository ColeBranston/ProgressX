import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";

const MAX_AMOUNT_ML = 5000 // matches the check constraint on water_log_entries.amount_ml

// GET /api/diet/water?date=YYYY-MM-DD
// Returns the signed-in user's water log entries for the given day (defaults to today).
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const logDate = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
        .from("water_log_entries")
        .select("*")
        .eq("user_id", userId)
        .eq("log_date", logDate)
        .order("created_at", { ascending: true })

    if (error) {
        console.log("Error fetching water log entries: ", error)
        return NextResponse.json({ message: "Error fetching water log entries" }, { status: 500 })
    }

    return NextResponse.json({ entries: data })
}

// POST /api/diet/water
// Logs one drink ({ amountMl, logDate }) for a day.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    try {
        const { amountMl, logDate } = await req.json()
        const amount = Math.round(Number(amountMl))

        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_ML) {
            return NextResponse.json({ message: `amountMl must be between 1 and ${MAX_AMOUNT_ML}` }, { status: 400 })
        }

        const { data, error } = await supabase
            .from("water_log_entries")
            .insert({
                user_id: userId,
                log_date: logDate ?? new Date().toISOString().slice(0, 10),
                amount_ml: amount,
            })
            .select()
            .single()

        if (error) {
            console.log("Error inserting water log entry: ", error)
            return NextResponse.json({ message: "Error adding water log entry" }, { status: 500 })
        }

        return NextResponse.json({ entry: data }, { status: 201 })
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.log("Error adding water log entry: ", error.message)
        return NextResponse.json({ message: `Error adding water log entry: ${error.message}` }, { status: 500 })
    }
}
