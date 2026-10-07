import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { checkUpload, deleteObjects, posterKey, putPoster } from "../../../libs/r2Videos";
import { cleanImage } from "../../../libs/imageUpload";
import { UUID, VIDEO_WITH_AUTHOR, VideoRowWithAuthor, toCards } from "../../../libs/videos";

const MAX_POSTER_DATA_URL = 1_500_000 // ~1 MB image as base64

const PROBLEMS = {
    missing: [ 410, "The upload didn't arrive. Try uploading the video again." ],
    too_big: [ 413, "Videos must be 200 MB or smaller" ],
    not_video: [ 415, "That file isn't an MP4 or MOV video" ],
    too_long: [ 400, "Videos can be up to 3 minutes long" ],
    unreadable: [ 422, "That video couldn't be read. Try exporting it again as an MP4." ],
} as const

// POST /api/videos/:id/complete  { poster?: "data:image/jpeg;base64,...", width?, height? }
//   -> { video: VideoCard }
// Called by the uploader once the file is in R2. Checks the bytes that actually arrived (a real
// MP4 / MOV, within the size and length limits); anything else is deleted. The poster frame the
// browser captured is re-encoded from its pixels before it's stored.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    const { id } = await context.params
    if (!UUID.test(id)) return NextResponse.json({ message: "Video not found" }, { status: 404 })

    const { data, error } = await supabase.from("videos").select(VIDEO_WITH_AUTHOR).eq("id", id).eq("user_id", userId).maybeSingle()
    if (error) {
        console.log("Error loading video: ", error.message)
        return NextResponse.json({ message: "Couldn't check the video" }, { status: 500 })
    }
    if (!data) return NextResponse.json({ message: "Video not found" }, { status: 404 })
    const row = data as unknown as VideoRowWithAuthor
    if (row.status === "ready") return NextResponse.json({ video: (await toCards([row], userId))[0] })

    const body = await req.json().catch(() => null)

    try {
        const check = await checkUpload(row.object_key)
        if (!check.ok) {
            await deleteObjects([row.object_key])
            await supabase.from("videos").delete().eq("id", row.id)
            const [ status, message ] = PROBLEMS[check.reason]
            return NextResponse.json({ message }, { status })
        }

        // poster: optional (some browsers can't decode every video to capture a frame)
        let poster: string | null = null
        const raw = typeof body?.poster === "string" && body.poster.length <= MAX_POSTER_DATA_URL ? body.poster : null
        const found = raw?.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
        if (found) {
            try {
                const jpeg = await cleanImage(Buffer.from(found[2], "base64"), { maxDimension: 720, quality: 78 })
                poster = posterKey(userId, row.id)
                await putPoster(poster, jpeg)
            } catch (e) {
                console.log("Skipping a video poster: ", e instanceof Error ? e.message : e)
                poster = null
            }
        }

        const dimension = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) <= 8192 ? v as number : null)
        const now = new Date().toISOString()
        const patch = {
            status: "ready" as const,
            duration_s: Math.round(check.durationS * 100) / 100,
            size_bytes: check.sizeBytes,
            content_type: check.contentType,
            poster_key: poster,
            width: dimension(body?.width),
            height: dimension(body?.height),
            ready_at: now,
            updated_at: now,
        }
        const { error: updateError } = await supabase.from("videos").update(patch).eq("id", row.id)
        if (updateError) throw updateError

        return NextResponse.json({ video: (await toCards([{ ...row, ...patch }], userId))[0] })
    } catch (e) {
        console.log("Couldn't finish a video upload: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't check the video right now. Try again." }, { status: 502 })
    }
}
