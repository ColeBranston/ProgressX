import { NextResponse } from "next/server"
import { supabase } from "@/app/supabaseClient/client"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  console.log(`Sign up request submitted, email: ${email}`)

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ status: 201 })
}
