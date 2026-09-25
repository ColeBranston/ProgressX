import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";

// GET /api/diet/log/summary?month=YYYY-MM
// Returns the distinct dates within that month the user has at least one food
// log entry for - powers the "which days did I log" month calendar view.
// Defaults to the current month if `month` is missing or malformed.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get("month")

    const match = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7)
    const [year, month] = match.split("-").map(Number)

    const startDate = `${match}-01`
    const lastDay = new Date(year, month, 0).getDate() // day 0 of next month = last day of this month
    const endDate = `${match}-${String(lastDay).padStart(2, "0")}`

    const { data, error } = await supabase
        .from("food_log_entries")
        .select("log_date")
        .eq("user_id", userId)
        .gte("log_date", startDate)
        .lte("log_date", endDate)

    if (error) {
        console.log("Error fetching food log summary: ", error)
        return NextResponse.json({ message: "Error fetching food log summary" }, { status: 500 })
    }

    const loggedDates = Array.from(new Set((data ?? []).map((row) => row.log_date as string)))

    return NextResponse.json({ month: match, loggedDates })
}
