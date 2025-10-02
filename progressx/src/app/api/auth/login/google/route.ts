import { NextResponse } from "next/server"
import { supabase } from "@/app/supabaseClient/client" // use anon client for login
import { redirect } from "next/navigation"

export async function GET() {
    const{ data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: "http://localhost:3000/login"
        }
    })

    redirect(data.url)
}

export async function POST(req: Request) {
    const { token } = await req.json();
    
    const res = NextResponse.json({"status": "200"})
    
    res.cookies.set("token", token ?? "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // only secure in prod
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 // 1 hour
      })

    return res
}