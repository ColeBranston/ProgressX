import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { supabase } from "./app/supabaseClient/client"
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MARGIN_SECONDS,
  SessionTokens,
  clearSessionCookies,
  refreshSession,
  setSessionCookies,
  verifyAccessToken,
} from "./app/api/libs/session"

type SessionCheck =
  | { status: "valid", userId: string, refreshed?: SessionTokens }
  | { status: "invalid" }      // no usable session: the user has to log in again
  | { status: "unavailable" }  // couldn't refresh because Supabase is unreachable: don't log them out

// Verifies the access token, and swaps it for a fresh one (via the refresh token) when it has
// expired or is about to. Only a rejected refresh token or a missing session counts as logged out.
async function checkSession(req: NextRequest): Promise<SessionCheck> {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value

  let current: { sub: string, exp?: number } | null = null
  if (accessToken) {
    try {
      current = await verifyAccessToken(accessToken)
    } catch {
      current = null // expired, forged, or malformed
    }
  }

  const secondsLeft = (current?.exp ?? 0) - Math.floor(Date.now() / 1000)
  if (current && secondsLeft > REFRESH_MARGIN_SECONDS) {
    return { status: "valid", userId: current.sub }
  }

  if (!refreshToken) {
    return current ? { status: "valid", userId: current.sub } : { status: "invalid" }
  }

  try {
    const refreshed = await refreshSession(refreshToken)
    if (!refreshed) {
      // Supabase rejected the refresh token; the current access token may still have a few minutes left
      return current ? { status: "valid", userId: current.sub } : { status: "invalid" }
    }
    const payload = await verifyAccessToken(refreshed.access_token)
    return { status: "valid", userId: payload.sub, refreshed }
  } catch (e) {
    console.log("Couldn't refresh session (Supabase unreachable?): ", e instanceof Error ? e.message : e)
    return current ? { status: "valid", userId: current.sub } : { status: "unavailable" }
  }
}

// Continue to the page / API route, handing it the refreshed tokens so it sees the new session
// on this very request, and send them to the browser as cookies.
function next(req: NextRequest, refreshed?: SessionTokens) {
  if (!refreshed) return NextResponse.next()

  req.cookies.set(ACCESS_COOKIE, refreshed.access_token)
  req.cookies.set(REFRESH_COOKIE, refreshed.refresh_token)
  const res = NextResponse.next({ request: { headers: req.headers } })
  setSessionCookies(res, refreshed)
  return res
}

function redirect(req: NextRequest, path: string, refreshed?: SessionTokens) {
  const res = NextResponse.redirect(new URL(path, req.url))
  if (refreshed) setSessionCookies(res, refreshed)
  return res
}

export async function middleware(req: NextRequest) {
  const session = await checkSession(req)

  // API routes check auth themselves (and answer 401); here we only keep the session fresh
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return session.status === "valid" ? next(req, session.refreshed) : NextResponse.next()
  }

  if (session.status === "unavailable") {
    // keep the cookies so the next attempt can refresh once Supabase is reachable again
    return redirect(req, "/login")
  }

  if (session.status === "invalid") {
    const res = redirect(req, "/login")
    clearSessionCookies(res)
    return res
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("isOnboarded")
    .eq("id", session.userId)
    .maybeSingle()

  if (error) {
    // a database hiccup is not a reason to log someone out; let the page load
    console.log("Onboarding check failed, letting the request through: ", error.message)
    return next(req, session.refreshed)
  }

  if (!profile) {
    // valid login but no profile row: the account isn't set up, so start over at login
    const res = redirect(req, "/login")
    clearSessionCookies(res)
    return res
  }

  if (!profile.isOnboarded) {
    return redirect(req, "/onboarding", session.refreshed)
  }

  return next(req, session.refreshed)
}

export const config = {
  // pages that need a login, plus every API route except /api/auth/* (login, signup, logout)
  matcher: ["/", "/research", "/profile", "/mystats", "/mydiet", "/settings", "/api/((?!auth).*)"],
}
