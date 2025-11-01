import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { supabase } from "@/app/supabaseClient/client";
import { encoder } from "@/app/api/auth/login/google/route";

export async function GET(req: NextRequest) {
    const token = req.cookies?.get("token")?.value

    try {
        
        const id = (await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!))).payload.sub

        const { error: imagesError, data } = await supabase.from("photo_collection").select("*").eq("user_id", id)

        if (imagesError) throw new Error(imagesError)

        console.log("Data from getting photos: ", data)

        return NextResponse.json({images: data}, {status: 200})

    } catch(e) {
        console.log("Error Getting Images: ", e)
        return NextResponse.json({message: `Error Getting Images: ${e}`}, {status: 500})
    }
}