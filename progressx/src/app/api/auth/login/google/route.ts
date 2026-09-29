import { NextResponse } from "next/server"
import { createAuthClient, supabase } from "@/app/supabaseClient/client"
import { redirect } from "next/navigation"
import { ACCESS_COOKIE, setSessionCookies, verifyAccessToken } from "@/app/api/libs/session"
import { isValidConsent, recordConsent } from "@/app/api/libs/consent"
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo"

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

// POST { token, refreshToken, acceptedTerms?, confirmedAge?, termsVersion? }: the tokens Supabase put in
// the URL hash after Google sign-in. If the person ticked the agreement boxes on the Sign Up tab before
// choosing Google, that agreement comes along and is recorded; otherwise the middleware sends them to
// /consent before they can use the app.
export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}))
    const { token, refreshToken } = body

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
    const { data: existing, error: lookupError } = await supabase.from("profiles").select("id, terms_version").eq("id", userID).maybeSingle()
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

    if (isValidConsent(body) && existing?.terms_version !== TERMS_VERSION) {
        try {
            await recordConsent(userID, "google", req.headers.get("user-agent"))
        } catch (e) {
            console.log("Error recording consent at Google sign-in: ", e)
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
