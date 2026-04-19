import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { supabase } from "@/app/supabaseClient/client";
import { encoder } from "@/app/api/auth/login/google/route";
import { PostgrestError } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
    const token = req.cookies?.get("token")?.value
    if (!token) return NextResponse.json({message: `Error Getting User Token`}, {status: 500})
    try {
        const id = (await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!))).payload.sub

        const { error: imagesError, data } = await supabase.from("photo_collection").select("*").eq("user_id", id)

        if (imagesError) throw new PostgrestError(imagesError)

        console.log("Data from getting photos: ", data)

        return NextResponse.json({images: data}, {status: 200})

    } catch(e: unknown) {
        const errorMessage = e instanceof PostgrestError? e.message : String(e)
        console.log("Error Getting Images: ", errorMessage)
        return NextResponse.json({message: `Error Getting Images: ${errorMessage}`}, {status: 500})
    }
}