import { NextRequest, NextResponse } from "next/server"
import { createAuthClient } from "@/app/supabaseClient/client"
import { ACCESS_COOKIE, clearSessionCookies } from "@/app/api/libs/session"

// POST /api/auth/logout
// Revokes this device's session with Supabase (so its refresh token can't be reused) and clears the
// login cookies. The client also clears the profile copy kept in localStorage.
export async function POST(req: NextRequest) {
    const accessToken = req.cookies.get(ACCESS_COOKIE)?.value

    if (accessToken) {
        // best effort: an already-expired token can't be revoked, but the cookies are cleared either way
        const { error } = await createAuthClient().auth.admin.signOut(accessToken, "local")
        if (error) console.log("Couldn't revoke session on logout: ", error.message)
    }

    const res = NextResponse.json({ message: "Logged out" })
    clearSessionCookies(res)
    return res
}
