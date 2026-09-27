import { NextResponse } from "next/server"
import { createAuthClient, supabase } from "@/app/supabaseClient/client"
import { redirect } from "next/navigation"
import { ACCESS_COOKIE, setSessionCookies, verifyAccessToken } from "@/app/api/libs/session"

export async function GET() {
    const{ data } = await createAuthClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${process.env.APP_URL}/login`
        }
    })
    if (data?.url) {
        redirect(data.url)
    }
}

// POST { token, refreshToken }: the tokens Supabase put in the URL hash after Google sign-in
export async function POST(req: Request) {
    const { token, refreshToken } = await req.json().catch(() => ({}))

    if (typeof token !== "string" || !token) {
        return NextResponse.json({ message: "token is required" }, { status: 400 })
    }

    let payload
    try {
        payload = await verifyAccessToken(token)
    } catch (e) {
        console.log("Error validating token: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Invalid or expired sign-in, please try again" }, { status: 401 })
    }

    const userID = payload.sub
    const email = payload.email

    // first Google sign-in: create the profile row the rest of the app expects
    const { data: existing, error: lookupError } = await supabase.from("profiles").select("id").eq("id", userID).maybeSingle()
    if (lookupError) {
        console.log("Error looking up google user's profile: ", lookupError)
        return NextResponse.json({ message: "Error signing in" }, { status: 500 })
    }
    if (!existing) {
        const { error: profileError } = await supabase.from("profiles").insert({ id: userID, email })
        if (profileError) {
            console.log("Error adding google user to profile's table: ", profileError)
            return NextResponse.json({ message: "Error signing in" }, { status: 500 })
        }
    }

    const res = NextResponse.json({ status: "200" })

    if (typeof refreshToken === "string" && refreshToken) {
        setSessionCookies(res, { access_token: token, refresh_token: refreshToken })
    } else {
        // no refresh token: the session can only last as long as this access token
        const secondsLeft = Math.max(0, (payload.exp ?? 0) - Math.floor(Date.now() / 1000))
        res.cookies.set(ACCESS_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: secondsLeft,
        })
    }

    return res
}
