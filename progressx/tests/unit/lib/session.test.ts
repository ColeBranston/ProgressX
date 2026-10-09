import { SignJWT } from "jose"
import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
    ACCESS_COOKIE, clearSessionCookies, IDLE_TIMEOUT_SECONDS, isIdleTooLong, LAST_ACTIVE_COOKIE, REFRESH_COOKIE,
    SESSION_MAX_AGE_SECONDS, SessionExpiredError, setSessionCookies, verifyAccessToken,
} from "@/app/api/libs/session"

const SECRET = "test-jwt-secret-that-is-long-enough-for-hs256"
const URL_ = "https://project.supabase.co"
const now = () => Math.floor(Date.now() / 1000)

function token(claims: Record<string, unknown> = {}, { audience = "authenticated", issuer = `${URL_}/auth/v1`, secret = SECRET, exp = now() + 3600 } = {}) {
    return new SignJWT({ sub: "user-1", ...claims })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setAudience(audience)
        .setIssuer(issuer)
        .setExpirationTime(exp)
        .sign(new TextEncoder().encode(secret))
}

beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", `${URL_}/`)
    vi.stubEnv("SUPABASE_JWT_SECRET", SECRET)
})

describe("verifyAccessToken", () => {
    it("accepts a valid Supabase token", async () => {
        expect((await verifyAccessToken(await token())).sub).toBe("user-1")
    })
    it.each([
        ["wrong secret", { secret: "another-secret-another-secret-another-secret" }],
        ["wrong audience", { audience: "anon" }],
        ["wrong issuer", { issuer: "https://evil.example/auth/v1" }],
        ["expired", { exp: now() - 10 }],
    ])("rejects a token with the %s", async (_, options) => {
        await expect(verifyAccessToken(await token({}, options))).rejects.toThrow()
    })
    it("rejects a token without a subject", async () => {
        await expect(verifyAccessToken(await token({ sub: "" }))).rejects.toThrow(/sub/)
    })
    it("ends sessions whose original sign-in is too old, even with a fresh token", async () => {
        const signedIn = now() - SESSION_MAX_AGE_SECONDS - 60
        await expect(verifyAccessToken(await token({ amr: [{ method: "password", timestamp: signedIn }] }))).rejects.toBeInstanceOf(SessionExpiredError)
        await expect(verifyAccessToken(await token({ amr: [{ method: "password", timestamp: now() - 60 }] }))).resolves.toBeTruthy()
    })
})

describe("cookies", () => {
    it("sets HttpOnly session cookies and the activity marker", () => {
        const res = NextResponse.json({})
        setSessionCookies(res, { access_token: "a", refresh_token: "r" })
        const access = res.cookies.get(ACCESS_COOKIE)
        expect(access).toMatchObject({ value: "a", httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS })
        expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("r")
        expect(Number(res.cookies.get(LAST_ACTIVE_COOKIE)?.value)).toBeGreaterThan(0)
    })
    it("clears every session cookie", () => {
        const res = NextResponse.json({})
        setSessionCookies(res, { access_token: "a", refresh_token: "r" })
        clearSessionCookies(res)
        for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, LAST_ACTIVE_COOKIE]) expect(res.cookies.get(name)?.value).toBe("")
    })
})

describe("isIdleTooLong", () => {
    it("logs out after the idle timeout", () => {
        expect(isIdleTooLong(String(now() - IDLE_TIMEOUT_SECONDS - 1))).toBe(true)
        expect(isIdleTooLong(String(now() - IDLE_TIMEOUT_SECONDS + 30))).toBe(false)
    })
    it("treats a missing or garbage cookie as active", () => {
        expect(isIdleTooLong(undefined)).toBe(false)
        expect(isIdleTooLong("abc")).toBe(false)
    })
})
