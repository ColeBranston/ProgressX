import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { supabase } from "./app/supabaseClient/client"
import {
  ACCESS_COOKIE,
  LAST_ACTIVE_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MARGIN_SECONDS,
  SessionTokens,
  clearSessionCookies,
  isIdleTooLong,
  markActive,
  refreshSession,
  SessionExpiredError,
  setSessionCookies,
  verifyAccessToken,
} from "./app/api/libs/session"
import { TERMS_VERSION } from "./app/internal_components/legal/legalInfo"

type SessionCheck =
  | { status: "valid", userId: string, refreshed?: SessionTokens }
  | { status: "invalid", reason?: "idle" }  // no usable session: the user has to log in again
  | { status: "unavailable" }  // couldn't refresh because Supabase is unreachable: don't log them out

// Verifies the access token, and swaps it for a fresh one (via the refresh token) when it has
// expired or is about to. Only a rejected refresh token or a missing session counts as logged out.
async function checkSession(req: NextRequest): Promise<SessionCheck> {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value

  // unused for too long: log in again, however fresh the tokens are
  if ((accessToken || refreshToken) && isIdleTooLong(req.cookies.get(LAST_ACTIVE_COOKIE)?.value)) {
    return { status: "invalid", reason: "idle" }
  }

  let current: { sub: string, exp?: number } | null = null
  if (accessToken) {
    try {
      current = await verifyAccessToken(accessToken)
    } catch (e) {
      // the sign-in itself is too old: log in again (refreshing wouldn't help, it keeps the sign-in time)
      if (e instanceof SessionExpiredError) return { status: "invalid" }
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
    if (e instanceof SessionExpiredError) return { status: "invalid" }
    console.log("Couldn't refresh session (Supabase unreachable?): ", e instanceof Error ? e.message : e)
    return current ? { status: "valid", userId: current.sub } : { status: "unavailable" }
  }
}

// The background "still logged in?" check from open tabs doesn't count as using the app
function countsAsActivity(req: NextRequest) {
  return !(req.method === "GET" && req.nextUrl.pathname === "/api/session")
}

// Continue to the page / API route, handing it the refreshed tokens so it sees the new session
// on this very request, and send them to the browser as cookies.
function next(req: NextRequest, refreshed?: SessionTokens) {
  let res: NextResponse
  if (refreshed) {
    req.cookies.set(ACCESS_COOKIE, refreshed.access_token)
    req.cookies.set(REFRESH_COOKIE, refreshed.refresh_token)
    res = NextResponse.next({ request: { headers: req.headers } })
    setSessionCookies(res, refreshed)
  } else {
    res = NextResponse.next()
  }
  if (countsAsActivity(req)) markActive(res)
  return res
}

function redirect(req: NextRequest, path: string, refreshed?: SessionTokens) {
  const res = NextResponse.redirect(new URL(path, req.url))
  if (refreshed) setSessionCookies(res, refreshed)
  return res
}

// Forward an API request with the login cookies removed, so the route answers 401 for an ended session
function nextWithoutSession(req: NextRequest) {
  req.cookies.delete(ACCESS_COOKIE)
  req.cookies.delete(REFRESH_COOKIE)
  req.cookies.delete(LAST_ACTIVE_COOKIE)
  const res = NextResponse.next({ request: { headers: req.headers } })
  clearSessionCookies(res)
  return res
}

export async function middleware(req: NextRequest) {
  const session = await checkSession(req)

  // API routes check auth themselves (and answer 401); here we only keep the session fresh
  if (req.nextUrl.pathname.startsWith("/api/")) {
    if (session.status === "valid") return next(req, session.refreshed)
    return session.status === "invalid" ? nextWithoutSession(req) : NextResponse.next()
  }

  const hadSession = req.cookies.has(ACCESS_COOKIE) || req.cookies.has(REFRESH_COOKIE)

  // The login page: anyone signed in goes straight to the app; everyone else sees the form
  if (req.nextUrl.pathname === "/login") {
    return session.status === "valid" ? redirect(req, "/", session.refreshed) : NextResponse.next()
  }

  // Visitors who aren't signed in get the public homepage at the site's root (same address, no
  // redirect), so the root URL describes the app to new people, search engines and Google's
  // OAuth branding check. Signed-in users get the app there as before.
  if (req.nextUrl.pathname === "/" && session.status !== "valid" && !hadSession) {
    return NextResponse.rewrite(new URL("/homepage", req.url))
  }

  if (session.status === "unavailable") {
    // keep the cookies so the next attempt can refresh once Supabase is reachable again
    return redirect(req, "/login")
  }

  if (session.status === "invalid") {
    // ?expired lets the login page explain why they're there (only when they had been signed in)
    const res = redirect(req, !hadSession ? "/login" : session.reason === "idle" ? "/login?expired=idle" : "/login?expired=1")
    clearSessionCookies(res)
    return res
  }

  const path = req.nextUrl.pathname

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("isOnboarded, terms_version")
    .eq("id", session.userId)
    .maybeSingle()

  if (error) {
    // a database hiccup is not a reason to log someone out; let the page load
    console.log("Profile check failed, letting the request through: ", error.message)
    return next(req, session.refreshed)
  }

  if (!profile) {
    // valid login but no profile row: the account isn't set up, so start over at login
    const res = redirect(req, "/login")
    clearSessionCookies(res)
    return res
  }

  // Everyone must have agreed to the current terms + privacy policy (and confirmed 18+) before
  // anything else: Google sign-ups, older accounts, and everyone again when TERMS_VERSION changes
  const agreed = profile.terms_version === TERMS_VERSION
  if (path === "/consent") {
    return agreed ? redirect(req, profile.isOnboarded ? "/" : "/onboarding", session.refreshed) : next(req, session.refreshed)
  }
  if (!agreed) {
    return redirect(req, "/consent", session.refreshed)
  }

  if (path === "/onboarding") {
    return profile.isOnboarded ? redirect(req, "/", session.refreshed) : next(req, session.refreshed)
  }
  if (!profile.isOnboarded) {
    return redirect(req, "/onboarding", session.refreshed)
  }

  return next(req, session.refreshed)
}

export const config = {
  // pages that need a login (plus the consent and onboarding steps), and every API route except
  // /api/auth/* (login, signup, logout)
  matcher: ["/", "/login", "/research", "/profile", "/mystats", "/mystats/:path*", "/mydiet", "/settings", "/consent", "/onboarding", "/api/((?!auth).*)"],
}
