import { NextRequest, NextResponse } from "next/server";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "@/app/api/libs/helpers";
import { cloudinaryImageOptions, ImageUploadError, imageDataUri, readSafeImageUpload } from "@/app/api/libs/imageUpload";

// POST /api/user/userImages/uploadUserImages  (multipart form, field "file")
// Adds a progress photo. The upload is size-checked, type-checked from its bytes and re-encoded
// (see libs/imageUpload) before it's stored.
export async function POST(req: NextRequest) {
    const id = await getUserIdFromRequest(req)
    if (!id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    let image: Buffer
    try {
        image = await readSafeImageUpload(req, { maxDimension: 2560 })
    } catch (e) {
        if (e instanceof ImageUploadError) return NextResponse.json({ message: e.message }, { status: e.status })
        console.log("Error reading progress photo upload: ", e)
        return NextResponse.json({ message: "Couldn't read that image" }, { status: 400 })
    }

    try {
        const uploadResponse = await CloudinaryService.getInstance().uploader.upload(imageDataUri(image), cloudinaryImageOptions(id))

        const { error: insertError, data: photo } = await supabase.from("photo_collection").insert({
            user_id: id,
            image_link: uploadResponse.secure_url,
            description: ''
        })
        .select("id, image_link, description, created_at")
        .single()

        if (insertError) {
            console.log("Error saving progress photo: ", insertError)
            return NextResponse.json({ message: "Error saving the photo" }, { status: 500 })
        }

        return NextResponse.json({ message: "Image uploaded", url: uploadResponse.secure_url, photo })
    } catch (e) {
        console.log("Error uploading progress photo: ", e)
        return NextResponse.json({ message: "Error uploading the photo" }, { status: 500 })
    }
}
