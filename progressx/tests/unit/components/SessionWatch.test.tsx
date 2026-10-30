// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import SessionWatch, { clearLocalAccountData } from "@/app/internal_components/SessionWatch"
import { json } from "../../helpers/uiStubs"

const MINUTE = 60_000
let fetch: ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>
const calls = () => fetch.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`)
const signedInData = () => localStorage.getItem("userData")
const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state })
    document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    localStorage.setItem("userData", "{}")
    // jsdom can't load another page; the console noise about that is expected
    vi.spyOn(console, "error").mockImplementation(() => {})
    fetch = vi.fn(async (input: RequestInfo | URL) => json({}, String(input) === "/api/expired" ? 401 : 200))
    vi.stubGlobal("fetch", fetch)
    setVisibility("visible")
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("clearLocalAccountData", () => {
    it("removes the account's local copies and leaves everything else", () => {
        localStorage.setItem("TotalExpenditure", "2500")
        localStorage.setItem("theme", "dark")
        clearLocalAccountData()
        expect(signedInData()).toBeNull()
        expect(localStorage.getItem("TotalExpenditure")).toBeNull()
        expect(localStorage.getItem("theme")).toBe("dark")
    })
})

describe("SessionWatch", () => {
    it("logs out a tab reopened after 15 idle minutes", async () => {
        localStorage.setItem("lastActivity", String(Date.now() - 16 * MINUTE))
        render(<SessionWatch />)
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(calls()).toEqual(["POST /api/auth/logout"])
        expect(signedInData()).toBeNull()
    })

    it("records opening the page as activity", () => {
        render(<SessionWatch />)
        expect(Number(localStorage.getItem("lastActivity"))).toBe(Date.now())
        expect(fetch).not.toHaveBeenCalled()
    })

    it("ends the session when an app request comes back 401, but not for a wrong password", async () => {
        render(<SessionWatch />)
        await window.fetch("/api/auth/login", { method: "POST" }).then(() => window.fetch(new URL("/api/auth/login", window.location.href)))
        fetch.mockResolvedValueOnce(json({}, 401))
        await window.fetch(new Request(new URL("/api/auth/login", window.location.href)))
        expect(signedInData()).toBe("{}")

        await window.fetch("/api/expired")
        expect(signedInData()).toBeNull()
        await window.fetch("/api/expired") // already leaving: nothing more happens
        expect(calls().filter((c) => c.includes("logout"))).toEqual([])
    })

    it("tells the server about activity at most once a minute", async () => {
        render(<SessionWatch />)
        act(() => { vi.advanceTimersByTime(500); window.dispatchEvent(new Event("keydown")) })
        await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
        window.dispatchEvent(new Event("pointerdown"))
        window.dispatchEvent(new Event("pointerdown")) // within the same second
        expect(calls().filter((c) => c === "POST /api/session")).toHaveLength(1)
        expect(Number(localStorage.getItem("lastActivity"))).toBe(Date.now())
    })

    it("checks the session every few minutes while the tab is in view", async () => {
        render(<SessionWatch />)
        window.dispatchEvent(new Event("scroll"))
        await act(async () => { await vi.advanceTimersByTimeAsync(5.5 * MINUTE) })
        expect(fetch).toHaveBeenCalledWith("/api/session", { cache: "no-store" })

        fetch.mockClear()
        setVisibility("hidden")
        await act(async () => { await vi.advanceTimersByTimeAsync(5.5 * MINUTE) })
        expect(fetch).not.toHaveBeenCalledWith("/api/session", { cache: "no-store" })
    })

    it("checks the session when the tab comes back, and logs out if it sat idle too long", async () => {
        render(<SessionWatch />)
        setVisibility("hidden")
        expect(fetch).not.toHaveBeenCalled()
        setVisibility("visible")
        expect(fetch).toHaveBeenCalledWith("/api/session", { cache: "no-store" })

        setVisibility("hidden")
        vi.setSystemTime(Date.now() + 16 * MINUTE)
        setVisibility("visible")
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(calls()).toContain("POST /api/auth/logout")
        expect(signedInData()).toBeNull()
    })

    it("logs out once 15 minutes pass without activity in any tab", async () => {
        render(<SessionWatch />)
        await act(async () => { await vi.advanceTimersByTimeAsync(15.5 * MINUTE) })
        expect(calls()).toContain("POST /api/auth/logout")
        expect(signedInData()).toBeNull()
    })

    it("puts fetch back when it's removed", () => {
        const { unmount } = render(<SessionWatch />)
        expect(window.fetch).not.toBe(fetch)
        unmount()
        expect(window.fetch).toBe(fetch)
    })
})
