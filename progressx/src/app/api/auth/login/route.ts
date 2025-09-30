import { NextResponse } from "next/server"
import { supabase } from "@/app/supabaseClient/client" // use anon client for login

export async function POST(req: Request) {
  const { email, password } = await req.json()

  console.log(`Login request submitted, email: ${email}`)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Create response
  const res = NextResponse.json(
    { user: data.user },
    { status: 200 }
  )

  // ✅ Store the access token in an HttpOnly cookie
  res.cookies.set("token", data.session?.access_token ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // only secure in prod
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 // 1 hour
  })

  return res
}
