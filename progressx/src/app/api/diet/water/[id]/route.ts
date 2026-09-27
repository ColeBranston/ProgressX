import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";

// DELETE /api/diet/water/[id]
// Removes one logged drink. Scoped to the signed-in user via .eq("user_id", userId)
// so one user can't delete another's entries.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const { data, error } = await supabase
        .from("water_log_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select()

    if (error) {
        console.log("Error deleting water log entry: ", error)
        return NextResponse.json({ message: "Error deleting water log entry" }, { status: 500 })
    }

    if (!data || data.length === 0) {
        return NextResponse.json({ message: "Water log entry not found" }, { status: 404 })
    }

    return NextResponse.json({ message: "Water log entry deleted" })
}
