import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { createUploadUrl, storageConfigured, videoKey } from "../../libs/r2Videos";
import { cleanCaption, overLimit } from "../../libs/videos";
import { requireVerified } from "../../libs/requireVerified";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_TYPES } from "@/app/internal_components/videos/videoTypes";

const UPLOADS_PER_HOUR = 10
const MAX_IN_PROGRESS = 3 // unfinished uploads per user

// POST /api/videos/upload  { caption, sizeBytes, type, durationSeconds }
//   -> { video: { id }, uploadURL, contentType }
// Creates the video (status "uploading") and a one-time link to PUT exactly this file into R2 (the
// size and type are signed into it). /api/videos/:id/complete then checks what actually arrived.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const unverified = await requireVerified(userId, "post videos")
    if (unverified) return unverified

    if (!storageConfigured()) {
        return NextResponse.json({ message: "Video uploads aren't set up yet" }, { status: 503 })
    }

    const body = await req.json().catch(() => null)
    const caption = cleanCaption(body?.caption)
    if (caption === null) {
        return NextResponse.json({ message: "Captions can be up to 300 characters" }, { status: 400 })
    }
    const size = Number(body?.sizeBytes)
    if (!Number.isInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ message: "Videos must be 200 MB or smaller" }, { status: 413 })
    }
    if (typeof body?.type !== "string" || !VIDEO_TYPES.includes(body.type)) {
        return NextResponse.json({ message: "Choose an MP4 or MOV video" }, { status: 415 })
    }
    const duration = Number(body?.durationSeconds)
    if (Number.isFinite(duration) && duration > MAX_VIDEO_SECONDS + 1) {
        return NextResponse.json({ message: `Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes long` }, { status: 400 })
    }

    const { count, error: countError } = await supabase
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "uploading")
    if (countError) {
        console.log("Error counting unfinished uploads: ", countError.message)
        return NextResponse.json({ message: "Couldn't start the upload" }, { status: 500 })
    }
    if ((count ?? 0) >= MAX_IN_PROGRESS) {
        return NextResponse.json({ message: "Finish your other uploads first (or wait a couple of hours for unfinished ones to clear)" }, { status: 429 })
    }
    if (overLimit(`upload:${userId}`, UPLOADS_PER_HOUR, 60 * 60 * 1000)) {
        return NextResponse.json({ message: "You've uploaded a lot of videos in the last hour. Try again later." }, { status: 429 })
    }

    const videoId = crypto.randomUUID()
    const key = videoKey(userId, videoId, body.type === "video/quicktime" ? "mov" : "mp4")
    let uploadURL: string
    try {
        uploadURL = await createUploadUrl(key, body.type, size)
    } catch (e) {
        console.log("Couldn't sign an R2 upload: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't start the upload. Try again in a minute." }, { status: 502 })
    }

    const { error } = await supabase.from("videos").insert({
        id: videoId, user_id: userId, object_key: key, caption, status: "uploading", size_bytes: size, content_type: body.type,
    })
    if (error) {
        console.log("Error saving new video: ", error.message)
        return NextResponse.json({ message: "Couldn't start the upload" }, { status: 500 })
    }

    return NextResponse.json({ video: { id: videoId }, uploadURL, contentType: body.type })
}
