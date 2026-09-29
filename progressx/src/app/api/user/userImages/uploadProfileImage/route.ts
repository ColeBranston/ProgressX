import { NextRequest, NextResponse } from "next/server";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { supabase } from "@/app/supabaseClient/client";
import { getPublicIdFromCloudinaryUrl, getUserIdFromRequest } from "@/app/api/libs/helpers";
import { cloudinaryImageOptions, ImageUploadError, imageDataUri, readSafeImageUpload } from "@/app/api/libs/imageUpload";

// POST /api/user/userImages/uploadProfileImage  (multipart form, field "file")
// Replaces the profile picture. The new image is checked and re-encoded (see libs/imageUpload),
// uploaded and saved first; the old one is only deleted after that, so a rejected or failed upload
// never leaves the profile without a picture.
export async function POST(req: NextRequest) {
    const id = await getUserIdFromRequest(req)
    if (!id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    let image: Buffer
    try {
        image = await readSafeImageUpload(req, { maxDimension: 1024 })
    } catch (e) {
        if (e instanceof ImageUploadError) return NextResponse.json({ message: e.message }, { status: e.status })
        console.log("Error reading profile picture upload: ", e)
        return NextResponse.json({ message: "Couldn't read that image" }, { status: 400 })
    }

    const cloudinary = CloudinaryService.getInstance()

    try {
        const { data: profile, error: profileError } = await supabase.from("profiles").select("profile_image").eq("id", id).single()
        if (profileError) throw profileError

        const uploadResponse = await cloudinary.uploader.upload(imageDataUri(image), cloudinaryImageOptions(id))

        const { error: updateError } = await supabase.from("profiles").update({ profile_image: uploadResponse.secure_url }).eq("id", id)
        if (updateError) {
            // don't leave an orphaned upload behind
            await cloudinary.uploader.destroy(uploadResponse.public_id).catch(() => null)
            throw updateError
        }

        // best effort: the new picture is already saved, so a failed cleanup isn't an error for the user
        if (profile?.profile_image) {
            try {
                const result = await cloudinary.uploader.destroy(getPublicIdFromCloudinaryUrl(profile.profile_image))
                if (result.result !== "ok") console.log("Couldn't delete the previous profile picture: ", result.result)
            } catch (e) {
                console.log("Couldn't delete the previous profile picture: ", e)
            }
        }

        return NextResponse.json({ imageReference: uploadResponse.secure_url })
    } catch (e) {
        console.log("Error updating profile picture: ", e)
        return NextResponse.json({ message: "Couldn't update your profile picture" }, { status: 500 })
    }
}
