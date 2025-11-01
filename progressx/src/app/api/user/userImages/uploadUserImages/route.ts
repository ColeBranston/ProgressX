import { NextRequest, NextResponse } from "next/server";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { supabase } from "@/app/supabaseClient/client";
import { jwtVerify } from "jose"
import { encoder } from "@/app/api/auth/login/google/route";

export async function POST(req: NextRequest) {

    const cloudinary = CloudinaryService.getInstance()

    try {
        
        const token = req.cookies.get("token")?.value

        const id = (await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!))).payload.sub

        const formData = await req.formData();
        const file = formData.get("file") as File;

        // Convert the file to a base64 string
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const uploadResponse = await cloudinary.uploader.upload(base64, {
        folder: "uploads",
        });

        console.log("Returned Data from Cloudinary upload:", uploadResponse);

        console.log("User ID for image upload: ", id)

        const {error: insertError } = await supabase.from("photo_collection").insert({
            user_id: id,
            image_link: uploadResponse.secure_url,
            description: ''
        })

        if (insertError) return NextResponse.json({message: "Error inserting image data into supabase"}, {status: 500})

        return NextResponse.json({ message: "Image uploaded", url: uploadResponse.secure_url });

    } catch (e) {
        console.log("Error Processing Image: ", e)
        return NextResponse.json({message: "Error Processing Image: ", e}, {status: 500})
    }
}
