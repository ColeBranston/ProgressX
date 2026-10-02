import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, JWTPayload } from "jose"
import type { NextResponse } from "next/server"
import { createAuthClient } from "@/app/supabaseClient/client"

// Shared by the middleware and every API route, so there's exactly one definition of a valid session.

export const ACCESS_COOKIE = "token"
export const REFRESH_COOKIE = "refresh_token"
export const LAST_ACTIVE_COOKIE = "last_active" // unix seconds of the last request the person made

// How long a sign-in lasts, counted from when the person actually logged in (not from the last
// refresh): after this they're sent back to the login screen, however active they've been.
// The access token itself only lives ~1 hour; the middleware swaps it for a new one using the
// refresh token until the sign-in reaches this age.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 5

// Logged out after this long without using the app. The middleware updates LAST_ACTIVE_COOKIE on every
// request except the background session check (GET /api/session), and SessionWatch logs open tabs out
// on the same schedule, so leaving a tab open doesn't keep someone signed in.
export const IDLE_TIMEOUT_SECONDS = 15 * 60

// Refresh a little early so a page load never starts with a token about to expire mid-request
export const REFRESH_MARGIN_SECONDS = 5 * 60

const encoder = new TextEncoder()

function supabaseAuthUrl() {
    return `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/auth/v1`
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

// Verifies a Supabase access token: signature, expiry, audience and issuer.
// Today the project signs with the shared HS256 secret; if it's ever moved to Supabase's
// asymmetric signing keys, those tokens are checked against the project's published keys.
export async function verifyAccessToken(token: string): Promise<JWTPayload & { sub: string }> {
    const options = { audience: "authenticated", issuer: supabaseAuthUrl() }
    const { alg } = decodeProtectedHeader(token)

    const { payload } = alg === "HS256"
        ? await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!), { ...options, algorithms: ["HS256"] })
        : await jwtVerify(token, (jwks ??= createRemoteJWKSet(new URL(`${supabaseAuthUrl()}/.well-known/jwks.json`))), options)

    if (typeof payload.sub !== "string" || !payload.sub) {
        throw new errors.JWTClaimValidationFailed("missing sub claim", payload, "sub", "check_failed")
    }
    if (isSignInTooOld(payload)) {
        throw new SessionExpiredError()
    }
    return payload as JWTPayload & { sub: string }
}

// Thrown when the token is valid but the sign-in it belongs to is older than SESSION_MAX_AGE_SECONDS
export class SessionExpiredError extends Error {
    constructor() {
        super("sign-in is older than the session limit")
        this.name = "SessionExpiredError"
    }
}

// When the person signed in: Supabase keeps the original sign-in time in the token's `amr` claim
// across refreshes (the token's own `iat` resets on every refresh)
function signedInAt(payload: JWTPayload): number | null {
    const amr = (payload as { amr?: unknown }).amr
    if (!Array.isArray(amr)) return null
    const times = amr.map((entry) => Number(entry?.timestamp)).filter((t) => Number.isFinite(t) && t > 0)
    return times.length ? Math.max(...times) : null
}

function isSignInTooOld(payload: JWTPayload): boolean {
    const at = signedInAt(payload) ?? payload.iat ?? null
    return at !== null && Math.floor(Date.now() / 1000) - at > SESSION_MAX_AGE_SECONDS
}

export type SessionTokens = { access_token: string, refresh_token: string }

// Swaps a refresh token for a new session.
// Returns null when Supabase rejects it (revoked / expired / reused) - the user really has to log in again.
// Throws when Supabase can't be reached, so callers don't log people out over a network blip.
export async function refreshSession(refreshToken: string): Promise<SessionTokens | null> {
    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken })

    if (error) {
        // AuthApiError = Supabase answered and said no; anything else (fetch failed, 5xx) is transient
        if (error.name === "AuthApiError" && (error.status ?? 500) < 500) return null
        throw error
    }
    if (!data.session) return null

    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
}

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
}

export function setSessionCookies(res: NextResponse, session: SessionTokens) {
    res.cookies.set(ACCESS_COOKIE, session.access_token, cookieOptions)
    res.cookies.set(REFRESH_COOKIE, session.refresh_token, cookieOptions)
    markActive(res)
}

export function clearSessionCookies(res: NextResponse) {
    res.cookies.delete(ACCESS_COOKIE)
    res.cookies.delete(REFRESH_COOKIE)
    res.cookies.delete(LAST_ACTIVE_COOKIE)
}

export function markActive(res: NextResponse) {
    res.cookies.set(LAST_ACTIVE_COOKIE, String(Math.floor(Date.now() / 1000)), cookieOptions)
}

// True when the last request was more than IDLE_TIMEOUT_SECONDS ago. No cookie (e.g. a sign-in from
// before this existed) counts as active; the first request sets it.
export function isIdleTooLong(lastActive: string | undefined): boolean {
    const at = Number(lastActive)
    return Number.isFinite(at) && at > 0 && Math.floor(Date.now() / 1000) - at > IDLE_TIMEOUT_SECONDS
}
