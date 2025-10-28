import { NextResponse } from "next/server"
import { supabase } from "@/app/supabaseClient/client"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  console.log(`Sign up request submitted, email: ${email}`)

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (userError || !userData?.user) {
    return NextResponse.json({ error: userError?.message || "error fetching user data" }, { status: 400 })
  }

  const userId = userData.user.id

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    email
  })

  if (profileError) {
    console.log("Error adding user to profiles table: ", profileError)
    return NextResponse.json({message: `Error adding user to profiles table: ${profileError.message}`},{status: 505})
  }

  return NextResponse.json({ status: 201 })
}
