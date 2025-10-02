import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!))
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
