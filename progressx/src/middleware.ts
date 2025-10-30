import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { supabase } from "./app/supabaseClient/client"
import { encoder } from "./app/api/auth/login/google/route"

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value

  if (!token) {
    console.log("No token found, redirecting to login")
    return NextResponse.redirect(new URL("/login", req.url))
  }

  try {
    const decoded = await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!))

    const userID = decoded?.payload?.sub
                        
    const { error: isOnboardingError, data: userData } = await supabase.from("profiles").select("*", ).eq("id", userID).single()

    console.log("user data: ", userData)

    if (isOnboardingError) {
        throw new Error(isOnboardingError.message)
    }

    const bool = userData?.isOnboarded

    if (!bool) {
      return NextResponse.redirect(new URL("/onboarding", req.url))

    }

    return NextResponse.next()
  } catch (e){

    console.log("Redirecting to Login with error: ", e)

    const res = NextResponse.redirect(new URL("/login", req.url))
    res.cookies.delete("token")

    return res;
  }
}

export const config = {
  matcher: ["/", "/research", "/profile", "/mystats"],
}
