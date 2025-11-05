import { getPublicIdFromCloudinaryUrl } from "@/app/api/libs/helpers";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { supabase } from "@/app/supabaseClient/client";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {

    const { imageLink } = await req.json()

    console.log("Incoming image for deletion: ", imageLink)

    const imageID = getPublicIdFromCloudinaryUrl(imageLink)

    console.log("Image ID: ", imageID)

    const deleteResponse = await CloudinaryService.getInstance().uploader.destroy(imageID)

    console.log("Delete response: ", deleteResponse)

    const { error: deleteImageError } = await supabase.from("photo_collection").delete().eq("image_link", imageLink.replace(/^"|"$/g, '')) //regex removes quotes: ""

    if (deleteResponse.result == 'ok' && !deleteImageError){
        return NextResponse.json({message: "image deleted successfully"}, {status: 200})
    } else {
        return NextResponse.json({message: `Error deleting image: supabase: ${deleteImageError}, cloudinary: ${deleteResponse}`}, {status: 500})
    }
}