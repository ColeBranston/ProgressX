import { verifyAccessToken } from "@/app/api/libs/session";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { PostgrestError } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
    const token = req.cookies?.get("token")?.value
    if (!token) return NextResponse.json({message: `Error Getting User Token`}, {status: 401})
    try {
        const id = (await verifyAccessToken(token)).sub

        // the blur setting comes back with the photos so the page knows before it renders any image
        const [
            { error: imagesError, data },
            { error: settingsError, data: settings },
        ] = await Promise.all([
            supabase
                .from("photo_collection")
                .select("id, image_link, description, created_at")
                .eq("user_id", id)
                .order("created_at", { ascending: false }), // newest first
            supabase
                .from("user_settings")
                .select("blur_progress_photos")
                .eq("user_id", id)
                .maybeSingle(), // no row = default settings
        ])

        if (imagesError) throw new PostgrestError(imagesError)
        if (settingsError) throw new PostgrestError(settingsError)

        return NextResponse.json({images: data, blurPhotos: settings?.blur_progress_photos ?? false}, {status: 200})

    } catch(e: unknown) {
        const errorMessage = e instanceof PostgrestError? e.message : String(e)
        console.log("Error Getting Images: ", errorMessage)
        return NextResponse.json({message: `Error Getting Images: ${errorMessage}`}, {status: 500})
    }
}