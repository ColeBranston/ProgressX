import { getPublicIdFromCloudinaryUrl, getUserIdFromRequest } from "@/app/api/libs/helpers";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { supabase } from "@/app/supabaseClient/client";
import { NextRequest, NextResponse } from "next/server";

// POST /api/user/userImages/deleteUserImages  { id }
// Deletes one of the signed-in user's progress photos from Cloudinary and photo_collection.
// The row is looked up by id AND user_id, so users can only delete their own photos.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { id } = await req.json()

    if (!id) {
        return NextResponse.json({ message: "id is required" }, { status: 400 })
    }

    const { data: photo, error: lookupError } = await supabase
        .from("photo_collection")
        .select("id, image_link")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle()

    if (lookupError) {
        console.log("Error looking up image for deletion: ", lookupError)
        return NextResponse.json({ message: "Error deleting image" }, { status: 500 })
    }

    if (!photo) {
        return NextResponse.json({ message: "Image not found" }, { status: 404 })
    }

    const deleteResponse = await CloudinaryService.getInstance().uploader.destroy(getPublicIdFromCloudinaryUrl(photo.image_link))

    // "not found" means it's already gone from Cloudinary, so the row can still be removed
    if (deleteResponse.result !== "ok" && deleteResponse.result !== "not found") {
        console.log("Cloudinary delete failed: ", deleteResponse)
        return NextResponse.json({ message: "Error deleting image from storage" }, { status: 500 })
    }

    const { error: deleteImageError } = await supabase
        .from("photo_collection")
        .delete()
        .eq("id", photo.id)
        .eq("user_id", userId)

    if (deleteImageError) {
        console.log("Error deleting image row: ", deleteImageError)
        return NextResponse.json({ message: "Error deleting image" }, { status: 500 })
    }

    return NextResponse.json({ message: "image deleted successfully" }, { status: 200 })
}
