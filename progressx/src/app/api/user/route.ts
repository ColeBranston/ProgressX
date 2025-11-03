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
    const { data } = await req.json()

    console.log("Incoming user data: ", data)

    return NextResponse.json({message: `Recieved user update, new data: ${data}`})
}