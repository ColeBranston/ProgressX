import { NextResponse } from "next/server"
import { createAuthClient, supabase } from "@/app/supabaseClient/client"
import { isValidConsent, recordConsent } from "@/app/api/libs/consent"

// POST /api/auth/signup  { email, password, acceptedTerms: true, confirmedAge: true, termsVersion }
// Creating an account requires agreeing to the current terms + privacy policy and confirming 18+.
// The agreement is recorded (profiles + consent_events) as part of creating the account.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const { email, password } = body ?? {}

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 })
  }

  if (!isValidConsent(body)) {
    return NextResponse.json({ message: "You must be 18 or older and agree to the Terms of Service and Privacy Policy to create an account" }, { status: 400 })
  }

  const { data: userData, error: userError } = await createAuthClient().auth.admin.createUser({
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

  try {
    await recordConsent(userId, "signup", req.headers.get("user-agent"))
  } catch (e) {
    // the account exists; without a recorded agreement they'll be asked again at /consent after logging in
    console.log("Error recording consent at signup: ", e)
  }

  return NextResponse.json({ status: 201 })
}
