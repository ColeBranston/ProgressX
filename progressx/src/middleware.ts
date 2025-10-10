import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { supabase } from "./app/supabaseClient/client"

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  try {
    const decoded = await jwtVerify(token, new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!))

    const userID = decoded?.payload?.sub
                        
    const { error: isOnboardingError, data: userData } = await supabase.from("profiles").select("*").eq("id", userID).single()

    console.log("user data: ", userData)

    if (isOnboardingError) {
        throw new Error(isOnboardingError.message)
    }

    const bool = userData?.isOnboarded

    if (!bool) {
      return NextResponse.redirect(new URL("/onboarding", req.url))

    }

    return NextResponse.next()
  } catch {

    const res = NextResponse.redirect(new URL("/login", req.url))
    res.cookies.delete("token")

    return res;
  }
}

export const config = {
  matcher: ["/", "/research"],
}
