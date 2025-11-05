import { encoder } from "@/app/api/auth/login/google/route";
import { getPublicIdFromCloudinaryUrl } from "@/app/api/libs/helpers";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { supabase } from "@/app/supabaseClient/client";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest){

    const cloudinary = CloudinaryService.getInstance()

    try {

        const token = req.cookies.get("token")?.value

        const id = (await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!))).payload.sub

        const { error: checkData, data: userData} = await supabase.from("profiles").select("*").eq("id", id).single()

        if (userData.profile_image) {
            const imageID = getPublicIdFromCloudinaryUrl(userData.profile_image)

            const deleteResponse = await cloudinary.uploader.destroy(imageID)
            
            console.log("Delete response: ", deleteResponse)

            if (deleteResponse.result != "ok") {
                throw new Error(`Failed to delete previous cloudinary image: ${deleteResponse.result}`)
            }
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        // Convert the file to a base64 string
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const uploadResponse = await cloudinary.uploader.upload(base64, {
        folder: "uploads",
        });

        return NextResponse.json({imageReference: uploadResponse.secure_url})


    } catch(e) {
        console.log(`Could not update profile with error: ${e}`)
        return NextResponse.json({message: `Could not update profile with error: ${e}`}, {status: 500})
    }
}