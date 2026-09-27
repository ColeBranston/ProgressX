import { verifyAccessToken } from "@/app/api/libs/session";
import { NextRequest, NextResponse } from "next/server";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { supabase } from "@/app/supabaseClient/client";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // Cloudinary's free-plan image limit

export async function POST(req: NextRequest) {

    const cloudinary = CloudinaryService.getInstance()

    try {
        
        const token = req.cookies.get("token")?.value
        if (!token) return NextResponse.json({message: "Unauthorized"}, {status: 401})

        const id = (await verifyAccessToken(token)).sub

        const formData = await req.formData();
        const file = formData.get("file");

        if (!(file instanceof File) || !file.type.startsWith("image/")) {
            return NextResponse.json({message: "An image file is required"}, {status: 400})
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json({message: "Images must be 10 MB or smaller"}, {status: 413})
        }

        // Convert the file to a base64 string
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const uploadResponse = await cloudinary.uploader.upload(base64, {
        folder: "uploads",
        });

        console.log("Returned Data from Cloudinary upload:", uploadResponse);

        console.log("User ID for image upload: ", id)

        const {error: insertError, data: photo } = await supabase.from("photo_collection").insert({
            user_id: id,
            image_link: uploadResponse.secure_url,
            description: ''
        })
        .select("id, image_link, description, created_at")
        .single()

        if (insertError) return NextResponse.json({message: "Error inserting image data into supabase"}, {status: 500})

        return NextResponse.json({ message: "Image uploaded", url: uploadResponse.secure_url, photo });

    } catch (e) {
        console.log("Error Processing Image: ", e)
        return NextResponse.json({message: "Error Processing Image: ", e}, {status: 500})
    }
}
