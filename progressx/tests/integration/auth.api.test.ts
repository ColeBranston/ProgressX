import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { accessToken, apiRequest, useTestAuthEnv } from "../helpers/auth"
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo"

// Supabase Auth is a separate service; its client is faked per test
const auth = vi.hoisted(() => ({
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    admin: { signOut: vi.fn(), createUser: vi.fn() },
}))
vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => ({ auth }) }))

const whoAmI = await import("@/app/api/auth/route")
const login = await import("@/app/api/auth/login/route")
const logout = await import("@/app/api/auth/logout/route")
const signup = await import("@/app/api/auth/signup/route")
const google = await import("@/app/api/auth/login/google/route")
const session = await import("@/app/api/session/route")
const consent = await import("@/app/api/user/consent/route")
const search = await import("@/app/api/search/[...path]/route")

const alice = "11111111-1111-4111-8111-111111111111"
const agreement = { acceptedTerms: true, confirmedAge: true, termsVersion: TERMS_VERSION }

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    for (const fn of [auth.signInWithPassword, auth.signInWithOAuth, auth.admin.signOut, auth.admin.createUser]) fn.mockReset()
})

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(new URL(path, "http://localhost:3000"), { method: "POST", headers: { "content-type": "application/json", "user-agent": "vitest-browser", ...headers }, body: JSON.stringify(body) })

describe("GET /api/auth", () => {
    it("returns the signed-in user's email", async () => {
        const req = new NextRequest("http://localhost:3000/api/auth", { headers: { cookie: `token=${await accessToken(alice, { email: "a@example.com" })}` } })
        const res = await whoAmI.GET(req)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ user: "a@example.com" })
    })

    it("refuses a missing or invalid token", async () => {
        expect(await (await whoAmI.GET(await apiRequest("/api/auth"))).json()).toEqual({ message: "No or invalid token: Missing Token" })
        const forged = new NextRequest("http://localhost:3000/api/auth", { headers: { cookie: "token=abc.def.ghi" } })
        expect((await whoAmI.GET(forged)).status).toBe(401)
    })
})

describe("POST /api/auth/login", () => {
    it("signs in and sets the session cookies", async () => {
        auth.signInWithPassword.mockResolvedValue({ data: { user: { id: alice, email: "a@example.com" }, session: { access_token: "access", refresh_token: "refresh" } }, error: null })
        const res = await login.POST(post("/api/auth/login", { email: "a@example.com", password: "pw" }))
        expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@example.com", password: "pw" })
        expect(await res.json()).toEqual({ user: { id: alice, email: "a@example.com" } })
        const cookies = res.headers.getSetCookie().join("\n")
        expect(cookies).toMatch(/token=access;.*HttpOnly/i)
        expect(cookies).toContain("refresh_token=refresh")
    })

    it("passes on why a sign-in failed", async () => {
        auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Invalid login credentials" } })
        const res = await login.POST(post("/api/auth/login", { email: "a@example.com", password: "nope" }))
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "Invalid login credentials" })

        auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: null })
        expect(await (await login.POST(post("/api/auth/login", { email: "a@example.com", password: "x" }))).json()).toEqual({ error: "Login failed" })
    })
})

describe("POST /api/auth/logout", () => {
    it("revokes this device's session and clears the cookies", async () => {
        auth.admin.signOut.mockResolvedValue({ error: null })
        const req = await apiRequest("/api/auth/logout", { method: "POST", userId: alice })
        const res = await logout.POST(req)
        expect(auth.admin.signOut).toHaveBeenCalledWith(req.cookies.get("token")!.value, "local")
        expect(res.cookies.get("token")?.value).toBe("")
        expect(res.cookies.get("refresh_token")?.value).toBe("")
    })

    it("clears the cookies even when the session can't be revoked", async () => {
        auth.admin.signOut.mockResolvedValue({ error: { message: "token expired" } })
        const res = await logout.POST(await apiRequest("/api/auth/logout", { method: "POST", userId: alice }))
        expect(await res.json()).toEqual({ message: "Logged out" })
        expect(res.cookies.get("token")?.value).toBe("")
    })

    it("has nothing to revoke without a session", async () => {
        expect((await logout.POST(await apiRequest("/api/auth/logout", { method: "POST" }))).status).toBe(200)
        expect(auth.admin.signOut).not.toHaveBeenCalled()
    })
})

describe("POST /api/auth/signup", () => {
    const signUp = (body: unknown) => signup.POST(post("/api/auth/signup", body))

    it("creates the account and profile, recording the agreement", async () => {
        auth.admin.createUser.mockResolvedValue({ data: { user: { id: alice } }, error: null })
        const res = await signUp({ email: "a@example.com", password: "pw", ...agreement })
        expect(await res.json()).toEqual({ status: 201 })
        expect(auth.admin.createUser).toHaveBeenCalledWith({ email: "a@example.com", password: "pw", email_confirm: true })
        expect(fakeDb.rows("profiles")).toEqual([expect.objectContaining({ id: alice, email: "a@example.com", terms_version: TERMS_VERSION })])
        expect(fakeDb.rows("consent_events")).toEqual([expect.objectContaining({ user_id: alice, source: "signup", age_confirmed: true, user_agent: "vitest-browser" })])
    })

    it.each([
        [{ email: "a@example.com" }, "Email and password are required"],
        [null, "Email and password are required"],
        [{ email: "a@example.com", password: "pw", ...agreement, confirmedAge: false }, /^You must be 18 or older/],
        [{ email: "a@example.com", password: "pw", ...agreement, termsVersion: "2020-01-01" }, /^You must be 18 or older/],
    ])("rejects %j", async (body, message) => {
        const res = await signUp(body)
        expect(res.status).toBe(400)
        expect((await res.json()).message).toMatch(message)
        expect(auth.admin.createUser).not.toHaveBeenCalled()
    })

    it("passes on why the account couldn't be created", async () => {
        auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: "A user with this email address has already been registered" } })
        const res = await signUp({ email: "a@example.com", password: "pw", ...agreement })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "A user with this email address has already been registered" })
    })

    it("reports a profile that couldn't be created", async () => {
        auth.admin.createUser.mockResolvedValue({ data: { user: { id: alice } }, error: null })
        fakeDb.failOn("profiles", "insert")
        expect((await signUp({ email: "a@example.com", password: "pw", ...agreement })).status).toBe(505)
    })

    it("still creates the account when the agreement can't be recorded", async () => {
        auth.admin.createUser.mockResolvedValue({ data: { user: { id: alice } }, error: null })
        fakeDb.failOn("consent_events")
        expect(await (await signUp({ email: "a@example.com", password: "pw", ...agreement })).json()).toEqual({ status: 201 })
    })
})

describe("/api/auth/login/google", () => {
    it("redirects to Google's sign-in", async () => {
        vi.stubEnv("APP_URL", "https://progressx.test")
        auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.test/o/oauth2" } })
        await expect(google.GET()).rejects.toMatchObject({ digest: expect.stringContaining("https://accounts.google.test/o/oauth2") })
        expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://progressx.test/login" } })
        auth.signInWithOAuth.mockResolvedValue({ data: {} })
        expect(await google.GET()).toBeUndefined()
    })

    const finish = async (body: Record<string, unknown>) => google.POST(post("/api/auth/login/google", body))

    it("creates the profile on first sign-in and keeps the session", async () => {
        const token = await accessToken(alice, { email: "a@gmail.test" })
        const res = await finish({ token, refreshToken: "refresh", ...agreement })
        expect(await res.json()).toEqual({ status: "200" })
        expect(res.cookies.get("token")?.value).toBe(token)
        expect(res.cookies.get("refresh_token")?.value).toBe("refresh")
        expect(fakeDb.rows("profiles")).toEqual([expect.objectContaining({ id: alice, email: "a@gmail.test", terms_version: TERMS_VERSION })])
        expect(fakeDb.rows("consent_events")).toEqual([expect.objectContaining({ source: "google" })])
    })

    it("doesn't record the agreement again, or without the boxes ticked", async () => {
        fakeDb.seed("profiles", [{ id: alice, terms_version: TERMS_VERSION }])
        await finish({ token: await accessToken(alice), refreshToken: "r", ...agreement })
        fakeDb.setTable("profiles", [{ id: alice, terms_version: "old" }])
        await finish({ token: await accessToken(alice), refreshToken: "r" })
        expect(fakeDb.rows("consent_events")).toEqual([])
        expect(fakeDb.rows("profiles")).toHaveLength(1)
    })

    it("signs in without a refresh token for as long as the token lasts", async () => {
        const res = await finish({ token: await accessToken(alice, { expiresIn: 600 }) })
        const cookie = res.headers.getSetCookie().find((c) => c.startsWith("token="))!
        expect(Number(cookie.match(/Max-Age=(\d+)/i)![1])).toBeGreaterThan(590)
        expect(res.cookies.get("refresh_token")).toBeUndefined()
    })

    it.each([
        [{}, 400],
        [{ token: "not-a-jwt" }, 401],
    ])("refuses %j", async (body, status) => {
        expect((await finish(body)).status).toBe(status)
        expect(fakeDb.rows("profiles")).toEqual([])
    })

    it("reports database errors", async () => {
        fakeDb.failOn("profiles", "select")
        expect((await finish({ token: await accessToken(alice) })).status).toBe(500)
        fakeDb.reset()
        fakeDb.failOn("profiles", "insert")
        expect((await finish({ token: await accessToken(alice) })).status).toBe(500)
    })

    it("still signs in when the agreement can't be recorded", async () => {
        fakeDb.failOn("consent_events")
        expect((await finish({ token: await accessToken(alice), refreshToken: "r", ...agreement })).status).toBe(200)
    })
})

describe("/api/session", () => {
    it("answers 200 while the login is good and 401 after", async () => {
        expect(await (await session.GET(await apiRequest("/api/session", { userId: alice }))).json()).toEqual({ ok: true })
        expect((await session.POST(await apiRequest("/api/session", { method: "POST", userId: alice }))).status).toBe(200)
        expect((await session.GET(await apiRequest("/api/session"))).status).toBe(401)
        const expired = new NextRequest("http://localhost:3000/api/session", { headers: { cookie: `token=${await accessToken(alice, { expiresIn: -10 })}` } })
        expect((await session.GET(expired)).status).toBe(401)
    })
})

describe("POST /api/user/consent", () => {
    const agree = async (body: unknown, userId: string | null = alice) => consent.POST(await apiRequest("/api/user/consent", { method: "POST", userId, body }))

    it("records agreement to the current terms", async () => {
        fakeDb.seed("profiles", [{ id: alice, terms_version: "old" }])
        expect(await (await agree(agreement)).json()).toEqual({ message: "Agreement recorded" })
        expect(fakeDb.rows("profiles")[0]).toMatchObject({ terms_version: TERMS_VERSION, terms_accepted_at: expect.any(String), age_confirmed_at: expect.any(String) })
        expect(fakeDb.rows("consent_events")).toEqual([expect.objectContaining({ user_id: alice, source: "reconsent", user_agent: "vitest" })])
    })

    it("needs a login and both boxes ticked", async () => {
        expect((await agree(agreement, null)).status).toBe(401)
        expect((await agree({ ...agreement, acceptedTerms: false })).status).toBe(400)
    })

    it("reports errors", async () => {
        fakeDb.failOn("profiles")
        expect((await agree(agreement)).status).toBe(500)
    })
})

describe("GET /api/search/*", () => {
    const get = (path: string) => search.GET(new NextRequest(new URL(path, "http://localhost:3000")))

    it("proxies to the search backend, keeping the path and its cache header", async () => {
        vi.stubEnv("SEARCH_BACKEND_URL", "http://search.test/")
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "Content-Type": "application/json", "X-Cache": "HIT" } }))
        vi.stubGlobal("fetch", fetchMock)
        const res = await get("/api/search/articles/caf%C3%A9?q=creatine&page=2")
        expect(fetchMock).toHaveBeenCalledWith("http://search.test/articles/caf%C3%A9?q=creatine&page=2", { cache: "no-store" })
        expect(res.headers.get("x-cache")).toBe("HIT")
        expect(await res.json()).toEqual({ results: [] })
    })

    it("passes the backend's status through", async () => {
        vi.stubEnv("SEARCH_BACKEND_URL", "http://search.test")
        vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })))
        const res = await get("/api/search/x")
        expect(res.status).toBe(404)
        expect(res.headers.get("content-type")).toMatch(/^text\/plain/)
    })

    it("explains when the backend isn't set up or reachable", async () => {
        vi.stubEnv("SEARCH_BACKEND_URL", "")
        expect((await get("/api/search/x")).status).toBe(500)
        vi.stubEnv("SEARCH_BACKEND_URL", "http://search.test")
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed") }))
        expect((await get("/api/search/x")).status).toBe(502)
    })
})
