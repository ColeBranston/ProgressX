import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { deleteObjects } from "../../libs/r2Videos";
import { UUID, VIDEO_COLUMNS, VideoRow, cleanCaption } from "../../libs/videos";

type Context = { params: Promise<{ id: string }> }

async function ownVideo(req: NextRequest, context: Context) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return { response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) }
    const { id } = await context.params
    if (!UUID.test(id)) return { response: NextResponse.json({ message: "Video not found" }, { status: 404 }) }

    const { data, error } = await supabase.from("videos").select(VIDEO_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle()
    if (error) {
        console.log("Error loading video: ", error.message)
        return { response: NextResponse.json({ message: "Couldn't load that video" }, { status: 500 }) }
    }
    if (!data) return { response: NextResponse.json({ message: "Video not found" }, { status: 404 }) }
    return { video: data as VideoRow }
}

// PATCH /api/videos/:id  { caption }   (your own videos only)
export async function PATCH(req: NextRequest, context: Context) {
    const { video, response } = await ownVideo(req, context)
    if (!video) return response

    const caption = cleanCaption((await req.json().catch(() => null))?.caption)
    if (caption === null) return NextResponse.json({ message: "Captions can be up to 300 characters" }, { status: 400 })

    const { error } = await supabase.from("videos").update({ caption, updated_at: new Date().toISOString() }).eq("id", video.id)
    if (error) {
        console.log("Error updating caption: ", error.message)
        return NextResponse.json({ message: "Couldn't save the caption" }, { status: 500 })
    }
    return NextResponse.json({ caption })
}

// DELETE /api/videos/:id   (your own videos only)
// Deletes the video file and its poster from R2 first, then the video and its likes / favourites.
export async function DELETE(req: NextRequest, context: Context) {
    const { video, response } = await ownVideo(req, context)
    if (!video) return response

    try {
        await deleteObjects([video.object_key, video.poster_key ?? ""])
    } catch (e) {
        console.log("Couldn't delete a video from R2: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't delete the video right now. Try again." }, { status: 502 })
    }

    const { error } = await supabase.from("videos").delete().eq("id", video.id)
    if (error) {
        console.log("Error deleting video row: ", error.message)
        return NextResponse.json({ message: "Couldn't delete the video" }, { status: 500 })
    }
    return NextResponse.json({ message: "Deleted" })
}
