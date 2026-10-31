import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { profileFromRoute } from "../../../libs/follows";

// DELETE /api/user/followers/:username  -> they no longer follow you  -> { followers }
// So a private profile's owner can take back access they gave (to see it again, they'd have to ask again)
export async function DELETE(req: NextRequest, context: { params: Promise<{ username: string }> }) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    try {
        const { username } = await context.params
        const follower = username === "me" ? null : await profileFromRoute(username, userId)
        if (!follower) return NextResponse.json({ message: "No such profile" }, { status: 404 })

        const { error } = await supabase.from("follows").delete().eq("follower_id", follower.id).eq("following_id", userId)
        if (error) throw error

        const { data } = await supabase.from("profiles").select("followers_count").eq("id", userId).single()
        return NextResponse.json({ followers: data?.followers_count ?? 0 })
    } catch (e) {
        console.log("Error removing a follower: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't remove that follower" }, { status: 500 })
    }
}
