import { SignJWT } from "jose"
import { NextRequest } from "next/server"
import { vi } from "vitest"

// Signs real Supabase-style access tokens with a test secret, so API routes run their normal session
// check (getUserIdFromRequest -> verifyAccessToken) instead of having it mocked away.
export const TEST_SUPABASE_URL = "https://test-project.supabase.co"
const SECRET = "integration-test-jwt-secret-0123456789abcdef"

export function useTestAuthEnv() {
    vi.stubEnv("SUPABASE_URL", TEST_SUPABASE_URL)
    vi.stubEnv("SUPABASE_JWT_SECRET", SECRET)
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "not-used-by-the-fake")
}

// expiresIn: seconds from now (negative for an expired token); signedInAt: unix seconds of the
// original sign-in, kept in the `amr` claim like Supabase does; email: the account's email claim
export function accessToken(userId: string, { expiresIn = 3600, signedInAt = undefined as number | undefined, email = undefined as string | undefined } = {}) {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({ sub: userId, role: "authenticated", ...(email ? { email } : {}), ...(signedInAt ? { amr: [{ method: "password", timestamp: signedInAt }] } : {}) })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(now - 60)
        .setAudience("authenticated")
        .setIssuer(`${TEST_SUPABASE_URL}/auth/v1`)
        .setExpirationTime(now + expiresIn)
        .sign(new TextEncoder().encode(SECRET))
}

// A request as the browser would send it, signed in as `userId` (or anonymous with null)
export async function apiRequest(path: string, { method = "GET", userId = null as string | null, body = undefined as unknown } = {}) {
    const headers = new Headers({ "user-agent": "vitest" })
    if (userId) headers.set("cookie", `token=${await accessToken(userId)}`)
    if (body !== undefined) headers.set("content-type", "application/json")
    return new NextRequest(new URL(path, "http://localhost:3000"), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })
