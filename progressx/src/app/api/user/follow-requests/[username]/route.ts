import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { acceptFollowRequests, profileFromRoute } from "../../../libs/follows";

type Context = { params: Promise<{ username: string }> }

// PUT /api/user/follow-requests/:username     -> accept their request: they follow you  -> { followers }
// DELETE /api/user/follow-requests/:username  -> decline it                              -> { followers }
export const PUT = (req: NextRequest, context: Context) => answer(req, context, true)
export const DELETE = (req: NextRequest, context: Context) => answer(req, context, false)

async function answer(req: NextRequest, context: Context, accept: boolean) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    try {
        const { username } = await context.params
        const requester = username === "me" ? null : await profileFromRoute(username, userId)
        if (!requester) return NextResponse.json({ message: "No such profile" }, { status: 404 })

        if (accept) {
            if (await acceptFollowRequests(userId, [requester.id]) === 0) {
                return NextResponse.json({ message: "That request is no longer there" }, { status: 404 })
            }
        } else {
            const { error } = await supabase.from("follow_requests").delete().eq("requester_id", requester.id).eq("target_id", userId)
            if (error) throw error
        }

        const { data } = await supabase.from("profiles").select("followers_count").eq("id", userId).single()
        return NextResponse.json({ followers: data?.followers_count ?? 0 })
    } catch (e) {
        console.log("Error answering a follow request: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't save that" }, { status: 500 })
    }
}
