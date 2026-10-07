import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../libs/helpers";
import { fetchAllPages, isDateString, readDateRange } from "../libs/dateRange";
import { loadUserSettings } from "../libs/userSettings";
import { LB_PER_KG } from "@/app/internal_components/profile/profileRules";
import { WEIGHT_KG_RANGE, WEIGHT_PERIODS, WeightPeriod } from "@/app/internal_components/weight/weightLog";

// Body weight check-ins: at most one "morning" and one "night" weight per day, stored in kg and shown
// in the user's weight unit (Settings). Logging the same day and time again replaces the entry.

type WeightRow = { log_date: string, period: WeightPeriod, weight_kg: number | string, updated_at: string }

const isPeriod = (value: unknown): value is WeightPeriod => WEIGHT_PERIODS.includes(value as WeightPeriod)

// GET /api/weight?from=YYYY-MM-DD&to=YYYY-MM-DD   ->  { entries: [{ date, period, weightKg }], weightUnit }
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
        const [ rows, { settings } ] = await Promise.all([
            fetchAllPages<WeightRow>((start, end) => supabase
                .from("weight_log_entries")
                .select("log_date, period, weight_kg, updated_at")
                .eq("user_id", userId)
                .gte("log_date", range.from)
                .lte("log_date", range.to)
                .order("log_date")
                .order("period", { ascending: true })
                .range(start, end)),
            loadUserSettings(userId),
        ])
        return NextResponse.json({
            entries: rows.map((row) => ({ date: row.log_date, period: row.period, weightKg: Number(row.weight_kg), updatedAt: row.updated_at })),
            weightUnit: settings.weightUnit,
        })
    } catch (e) {
        console.log("Error loading weight log: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load your weight log" }, { status: 500 })
    }
}

// PUT /api/weight  { date, period: "morning" | "night", weightKg }
// Saves (or replaces) that day's morning or night weight.
export async function PUT(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const weightKg = Math.round(Number(body?.weightKg) * 100) / 100
    if (!isDateString(body?.date) || !isPeriod(body?.period)) {
        return NextResponse.json({ message: "date (YYYY-MM-DD) and period (morning or night) are required" }, { status: 400 })
    }
    if (!Number.isFinite(weightKg) || weightKg < WEIGHT_KG_RANGE[0] || weightKg > WEIGHT_KG_RANGE[1]) {
        return NextResponse.json({ message: "That weight doesn't look right" }, { status: 400 })
    }

    const { data, error } = await supabase
        .from("weight_log_entries")
        .upsert(
            { user_id: userId, log_date: body.date, period: body.period, weight_kg: weightKg, updated_at: new Date().toISOString() },
            { onConflict: "user_id,log_date,period" },
        )
        .select("log_date, period, weight_kg, updated_at")
        .single()

    if (error) {
        console.log("Error saving weight: ", error.message)
        return NextResponse.json({ message: "Couldn't save your weight" }, { status: 500 })
    }

    // Keep the profile weight (calorie, protein and water targets) current: the latest morning weigh-in
    if (body.period === "morning") {
        const { data: latest } = await supabase
            .from("weight_log_entries")
            .select("log_date")
            .eq("user_id", userId)
            .eq("period", "morning")
            .order("log_date", { ascending: false })
            .limit(1)
            .maybeSingle()
        if (latest?.log_date === body.date) {
            const { error: profileError } = await supabase
                .from("profiles")
                .update({ weight_lbs: Math.round(weightKg * LB_PER_KG) })
                .eq("id", userId)
            if (profileError) console.log("Couldn't update profile weight: ", profileError.message)
        }
    }

    const row = data as WeightRow
    return NextResponse.json({ entry: { date: row.log_date, period: row.period, weightKg: Number(row.weight_kg), updatedAt: row.updated_at } })
}

// DELETE /api/weight?date=YYYY-MM-DD&period=morning|night
export async function DELETE(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const params = new URL(req.url).searchParams
    const date = params.get("date")
    const period = params.get("period")
    if (!isDateString(date) || !isPeriod(period)) {
        return NextResponse.json({ message: "date (YYYY-MM-DD) and period (morning or night) are required" }, { status: 400 })
    }

    const { error } = await supabase.from("weight_log_entries").delete().eq("user_id", userId).eq("log_date", date).eq("period", period)
    if (error) {
        console.log("Error deleting weight: ", error.message)
        return NextResponse.json({ message: "Couldn't delete that weight" }, { status: 500 })
    }
    return NextResponse.json({ message: "Deleted" })
}
