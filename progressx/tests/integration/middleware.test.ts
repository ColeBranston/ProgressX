import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { accessToken, useTestAuthEnv } from "../helpers/auth"
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo"

const auth = vi.hoisted(() => ({ refreshSession: vi.fn() }))
vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => ({ auth }) }))

const { middleware } = await import("@/middleware")

const alice = "11111111-1111-4111-8111-111111111111"
const now = () => Math.floor(Date.now() / 1000)

beforeEach(() => {
    fakeDb.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    auth.refreshSession.mockReset()
    fakeDb.seed("profiles", [{ id: alice, isOnboarded: true, terms_version: TERMS_VERSION }])
})

type Cookies = { token?: string, refresh_token?: string, last_active?: string }

async function visit(path: string, cookies: Cookies = {}, method = "GET") {
    const header = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ")
    const req = new NextRequest(new URL(path, "http://localhost:3000"), { method, headers: header ? { cookie: header } : {} })
    const res = await middleware(req)
    return {
        res,
        location: res.headers.get("location")?.replace("http://localhost:3000", "") ?? null,
        rewrite: res.headers.get("x-middleware-rewrite")?.replace("http://localhost:3000", "") ?? null,
        passedOn: res.headers.get("x-middleware-next") === "1",
        // cookies the route sees on this request, when the middleware changed them
        forwardedCookies: res.headers.get("x-middleware-request-cookie"),
        set: (name: string) => res.cookies.get(name),
    }
}

const signedIn = async (extra: Cookies = {}) => ({ token: await accessToken(alice), refresh_token: "refresh-1", ...extra })

describe("middleware: pages", () => {
    it("lets a signed-in, onboarded user in and marks them active", async () => {
        const { passedOn, set } = await visit("/mystats", await signedIn())
        expect(passedOn).toBe(true)
        expect(Number(set("last_active")?.value)).toBeGreaterThanOrEqual(now() - 1)
        expect(auth.refreshSession).not.toHaveBeenCalled()
    })

    it("sends visitors to the login page, and the root to the public homepage", async () => {
        expect((await visit("/mystats")).location).toBe("/login")
        expect((await visit("/")).rewrite).toBe("/homepage")
        expect((await visit("/?v=abc 123")).location).toBe("/explore?v=abc+123")
        expect((await visit("/login")).passedOn).toBe(true)
    })

    it("lets visitors browse public pages", async () => {
        for (const path of ["/explore", "/search", "/research", "/research/123", "/profile/alice_lifts"]) {
            expect((await visit(path)).passedOn).toBe(true)
        }
        expect((await visit("/profile")).location).toBe("/login")
    })

    it("browses public pages signed out after a login ends, dropping its cookies", async () => {
        const { passedOn, set } = await visit("/explore", { token: "forged", last_active: String(now()) })
        expect(passedOn).toBe(true)
        expect(set("token")?.value).toBe("")
    })

    it("sends a signed-in user from the login page to the app", async () => {
        expect((await visit("/login", await signedIn())).location).toBe("/")
    })

    it("logs out after 15 idle minutes, saying why", async () => {
        const { location, set } = await visit("/mydiet", await signedIn({ last_active: String(now() - 16 * 60) }))
        expect(location).toBe("/login?expired=idle")
        expect(set("token")?.value).toBe("")
        expect(set("refresh_token")?.value).toBe("")
    })

    it("logs out a sign-in older than the session limit, even with a fresh token", async () => {
        const token = await accessToken(alice, { signedInAt: now() - 6 * 60 * 60 })
        const { location } = await visit("/mydiet", { token, refresh_token: "r" })
        expect(location).toBe("/login?expired=1")
        expect(auth.refreshSession).not.toHaveBeenCalled()
    })

    it("refreshes a token that's about to expire, handing the new one to the page", async () => {
        const fresh = await accessToken(alice)
        auth.refreshSession.mockResolvedValue({ data: { session: { access_token: fresh, refresh_token: "refresh-2" } }, error: null })
        const { passedOn, set, forwardedCookies } = await visit("/mydiet", { token: await accessToken(alice, { expiresIn: 60 }), refresh_token: "refresh-1" })
        expect(auth.refreshSession).toHaveBeenCalledWith({ refresh_token: "refresh-1" })
        expect(passedOn).toBe(true)
        expect(set("token")?.value).toBe(fresh)
        expect(set("refresh_token")?.value).toBe("refresh-2")
        expect(forwardedCookies).toContain("refresh_token=refresh-2")
    })

    it("signs in from just a refresh token", async () => {
        auth.refreshSession.mockResolvedValue({ data: { session: { access_token: await accessToken(alice), refresh_token: "refresh-2" } }, error: null })
        expect((await visit("/mystats", { refresh_token: "refresh-1" })).passedOn).toBe(true)
    })

    it("keeps an expiring session that Supabase won't refresh until it runs out", async () => {
        auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { name: "AuthApiError", status: 400, message: "Invalid Refresh Token" } })
        expect((await visit("/mystats", { token: await accessToken(alice, { expiresIn: 60 }), refresh_token: "used" })).passedOn).toBe(true)
        expect((await visit("/mystats", { token: await accessToken(alice, { expiresIn: -60 }), refresh_token: "used" })).location).toBe("/login?expired=1")
        auth.refreshSession.mockResolvedValue({ data: { session: null }, error: null })
        expect((await visit("/mystats", { refresh_token: "used" })).location).toBe("/login?expired=1")
    })

    it("doesn't log anyone out when Supabase can't be reached", async () => {
        auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" } })
        // still a few minutes left: carry on
        expect((await visit("/mystats", { token: await accessToken(alice, { expiresIn: 60 }), refresh_token: "r" })).passedOn).toBe(true)
        // expired: try again from the login page, keeping the cookies
        const { location, set } = await visit("/mystats", { token: await accessToken(alice, { expiresIn: -60 }), refresh_token: "r" })
        expect(location).toBe("/login")
        expect(set("refresh_token")).toBeUndefined()
    })

    it("logs out when the refreshed session belongs to a sign-in that's too old", async () => {
        auth.refreshSession.mockResolvedValue({ data: { session: { access_token: await accessToken(alice, { signedInAt: now() - 6 * 60 * 60 }), refresh_token: "r2" } }, error: null })
        expect((await visit("/mystats", { refresh_token: "r" })).location).toBe("/login?expired=1")
    })

    it("uses a valid token as is when there's no refresh token", async () => {
        expect((await visit("/mystats", { token: await accessToken(alice, { expiresIn: 60 }) })).passedOn).toBe(true)
    })

    it("sends people through consent and onboarding first", async () => {
        const profile = fakeDb.table("profiles")[0]
        profile.terms_version = "old"
        expect((await visit("/mystats", await signedIn())).location).toBe("/consent")
        expect((await visit("/consent", await signedIn())).passedOn).toBe(true)

        profile.terms_version = TERMS_VERSION
        profile.isOnboarded = false
        expect((await visit("/consent", await signedIn())).location).toBe("/onboarding")
        expect((await visit("/mystats", await signedIn())).location).toBe("/onboarding")
        expect((await visit("/onboarding", await signedIn())).passedOn).toBe(true)

        profile.isOnboarded = true
        expect((await visit("/consent", await signedIn())).location).toBe("/")
        expect((await visit("/onboarding", await signedIn())).location).toBe("/")
    })

    it("starts over at login for a login with no profile", async () => {
        fakeDb.setTable("profiles", [])
        const { location, set } = await visit("/mystats", await signedIn())
        expect(location).toBe("/login")
        expect(set("token")?.value).toBe("")
    })

    it("lets the page load when the profile can't be checked", async () => {
        fakeDb.failOn("profiles")
        expect((await visit("/mystats", await signedIn())).passedOn).toBe(true)
    })
})

describe("middleware: API routes", () => {
    it("passes signed-in requests on and keeps them active", async () => {
        const { passedOn, set } = await visit("/api/weight", await signedIn(), "PUT")
        expect(passedOn).toBe(true)
        expect(set("last_active")).toBeDefined()
    })

    it("doesn't count the background session check as activity", async () => {
        const { passedOn, set } = await visit("/api/session", await signedIn())
        expect(passedOn).toBe(true)
        expect(set("last_active")).toBeUndefined()
    })

    it("strips an ended session so the route answers 401", async () => {
        const { passedOn, forwardedCookies, set } = await visit("/api/weight", await signedIn({ last_active: String(now() - 20 * 60) }))
        expect(passedOn).toBe(true)
        expect(forwardedCookies ?? "").not.toContain("token=")
        expect(set("token")?.value).toBe("")
    })

    it("passes requests on untouched when Supabase can't be reached", async () => {
        auth.refreshSession.mockRejectedValue(new TypeError("fetch failed"))
        const { passedOn, set } = await visit("/api/weight", { refresh_token: "r" })
        expect(passedOn).toBe(true)
        expect(set("token")).toBeUndefined()
    })

    it("needs no profile for API routes", async () => {
        fakeDb.setTable("profiles", [])
        expect((await visit("/api/weight", await signedIn())).passedOn).toBe(true)
    })
})
