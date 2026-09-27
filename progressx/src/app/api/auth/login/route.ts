import { NextResponse } from "next/server"
import { createAuthClient } from "@/app/supabaseClient/client"
import { setSessionCookies } from "@/app/api/libs/session"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  console.log(`Login request submitted, email: ${email}`)

  // a fresh client per login, so this user's session never sticks to the shared server client
  const { data, error } = await createAuthClient().auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? "Login failed" }, { status: 400 })
  }

  // Create response
  const res = NextResponse.json(
    { user: data.user },
    { status: 200 }
  )

  // access token + refresh token in HttpOnly cookies; the middleware refreshes the access token as it expires
  setSessionCookies(res, data.session)

  return res
}
