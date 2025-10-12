import { NextResponse } from "next/server"
import { supabase } from "@/app/supabaseClient/client" // use anon client for login
import { redirect } from "next/navigation"
import { jwtVerify } from "jose"

export async function GET() {
    const{ data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: "http://localhost:3000/login"
        }
    })
    if (data?.url) {
        redirect(data.url)
    }
}

export const encoder = new TextEncoder()

export async function POST(req: Request) {
    const { token } = await req.json();
    
    const res = NextResponse.json({"status": "200"})

    const encodedSecret = encoder.encode(process.env.SUPABASE_JWT_SECRET)
    
    try {
        const decoded = await jwtVerify(token, encodedSecret)
        
        res.cookies.set("token", token ?? "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // only secure in prod
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 // 1 hour
        })
        
        console.log("Incoming Token: ", decoded)

        const email = decoded.payload.email
        const userID = decoded.payload.sub

        const { error: profileError } = await supabase.from("profiles").insert({
            id: userID,
            email
        })

        if (profileError) {
            console.log("Error adding google user to profile's table")
        }
        
    } catch(e) {
        console.log("Error validating token: ", e)
    }

    return res
}