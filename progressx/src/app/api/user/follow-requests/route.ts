import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";

const MAX_REQUESTS = 200

// GET /api/user/follow-requests  -> { requests: [{ username, name, pfp, requestedAt }] }
// The people waiting for you to accept their follow request (only private profiles get them), newest first
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    try {
        const { data, error } = await supabase
            .from("follow_requests")
            .select("requester_id, created_at")
            .eq("target_id", userId)
            .order("created_at", { ascending: false })
            .limit(MAX_REQUESTS)
        if (error) throw error
        const rows = data ?? []
        if (!rows.length) return NextResponse.json({ requests: [] })

        const { data: people, error: peopleError } = await supabase
            .from("profiles")
            .select("id, display_username, display_name, profile_image")
            .in("id", rows.map((row) => row.requester_id))
        if (peopleError) throw peopleError
        const byId = new Map((people ?? []).map((person) => [person.id as string, person]))

        return NextResponse.json({
            requests: rows.flatMap((row) => {
                const person = byId.get(row.requester_id as string)
                if (!person?.display_username) return []
                return [{ username: person.display_username, name: person.display_name ?? "", pfp: person.profile_image, requestedAt: row.created_at }]
            }),
        })
    } catch (e) {
        console.log("Error listing follow requests: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load your follow requests" }, { status: 500 })
    }
}
