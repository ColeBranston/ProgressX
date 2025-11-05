import { supabase } from "@/app/supabaseClient/client";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "../../../../node_modules/next/server";
import { encoder } from "../auth/login/google/route";

export async function GET(req: NextRequest) {
    const token = req.cookies?.get("token")?.value

    try {
        const id = (await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!)))?.payload?.sub

        if (id) {
            const {error: userError, data: userData} = await supabase.from('profiles').select('*').eq("id", id).single()

            if (userError) throw new Error(userError.message)

            return NextResponse.json({userData: userData})
        }
    } catch(e) {
        console.log("Error Decoding Token: ", e)
        return NextResponse.json({Error: e})
    }
}

export async function POST(req: NextRequest) {
    try {
        const { user } = await req.json()

        const token = req.cookies.get("token")?.value

        const id = (await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET)))?.payload?.sub

        const { error: onboardingError } = await supabase.from("profiles").update({
                    profile_image: user.pfp
                }).eq('id', id)

        if (onboardingError) {
            throw new Error(`${onboardingError}`)
        }

        return NextResponse.json({message: `Recieved user update`})
    } catch(e) {
        console.log("Error: ", e)
    }
}