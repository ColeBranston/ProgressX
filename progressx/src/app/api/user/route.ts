import { verifyAccessToken } from "@/app/api/libs/session";
import { supabase } from "@/app/supabaseClient/client";
import { NextRequest, NextResponse } from "../../../../node_modules/next/server";

export async function GET(req: NextRequest) {
    const token = req.cookies?.get("token")?.value

    try {
        const id = (await verifyAccessToken(token as string)).sub

        if (id) {
            const {error: userError, data: userData} = await supabase.from('profiles').select('*').eq("id", id).single()

            if (userError) throw new Error(await userError.message)

            return NextResponse.json({userData: userData})
        }
    } catch(e) {
        console.log("Error Decoding Token: ", e instanceof Error ? e.message : e)
    }
    return NextResponse.json({message: "Not logged in"}, {status: 401})
}

export async function POST(req: NextRequest) {
    try {
        const { user } = await req.json()

        const token = req.cookies.get("token")?.value

        if (!token) {
            return NextResponse.json({message: "Not logged in"}, {status: 401})
        }

        const id = (await verifyAccessToken(token)).sub

        // other people see these on your profile, so only accept what the app itself would send
        const update: Record<string, string | null> = {}
        if (user?.privacy === "public" || user?.privacy === "private") update.profile_privacy = user.privacy
        if (user?.bio === null || typeof user?.bio === "string") update.profile_bio = user.bio === null ? null : String(user.bio).slice(0, 500)
        if (user?.pfp === null || (typeof user?.pfp === "string" && user.pfp.startsWith("https://res.cloudinary.com/"))) update.profile_image = user.pfp

        const { error: onboardingError } = await supabase.from("profiles").update(update).eq('id', id)

        if (onboardingError) {
            throw new Error(`${onboardingError}`)
        }

        return NextResponse.json({message: `Recieved user update`})
    } catch(e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.log("Error: ", error.message)

        return NextResponse.json({error: `Error updating profile: ${error.message}`}, {status: 500})

    }
}