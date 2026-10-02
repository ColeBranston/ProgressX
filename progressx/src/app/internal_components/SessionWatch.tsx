"use client";

import { useEffect } from "react";

// The browser-side copies of the account's data (cleared on log out, account deletion and expiry)
const LOCAL_ACCOUNT_KEYS = ["userData", "TotalExpenditure", "user_photos", "lastActivity"]

export function clearLocalAccountData() {
    try {
        for (const key of LOCAL_ACCOUNT_KEYS) localStorage.removeItem(key)
    } catch { /* storage unavailable */ }
}

// Keep in step with IDLE_TIMEOUT_SECONDS in api/libs/session.ts (the server enforces it too)
const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const CHECK_EVERY_MS = 30 * 1000
const SESSION_CHECK_EVERY_MS = 5 * 60 * 1000
const SERVER_TOUCH_EVERY_MS = 60 * 1000  // tell the server about activity at most once a minute
const LAST_ACTIVITY_KEY = "lastActivity" // shared by every open tab; cleared on the login page
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "wheel", "mousemove"] as const

function isAppApi(input: RequestInfo | URL): boolean {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, window.location.href)
    // /api/auth/* answers 401 for a wrong password, which isn't an ended session
    return url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth")
}

function readLastActivity(fallback: number): number {
    try {
        const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY))
        return Number.isFinite(value) && value > 0 ? value : fallback
    } catch {
        return fallback
    }
}

// Sends the person back to the login screen as soon as their login ends, even if the page has been
// left open:
// - after 15 minutes without using the app in any tab (they're logged out on the server too)
// - when any app request is answered with 401 (5-hour sign-in limit, or logged out elsewhere)
// - when a check every few minutes, or when the tab comes back into view, finds the login has ended
export default function SessionWatch() {
    useEffect(() => {
        let leaving = false
        let lastActivity = Date.now()
        let lastServerTouch = Date.now()
        const originalFetch = window.fetch

        const leave = (reason: "idle" | "1") => {
            if (leaving) return
            leaving = true
            clearLocalAccountData()
            const go = () => { window.location.href = `/login?expired=${reason}` } // full reload resets in-memory state
            // inactivity: end the session on the server too, so the cookies can't be reused
            if (reason === "idle") originalFetch("/api/auth/logout", { method: "POST" }).catch(() => {}).finally(go)
            else go()
        }

        window.fetch = async (input, init) => {
            const res = await originalFetch(input, init)
            if (res.status === 401 && isAppApi(input)) leave("1")
            return res
        }

        const recordActivity = (now: number) => {
            lastActivity = now
            try { localStorage.setItem(LAST_ACTIVITY_KEY, String(now)) } catch { /* storage unavailable */ }
            // the server only sees requests, so reading or scrolling a page has to be reported to it
            if (now - lastServerTouch > SERVER_TOUCH_EVERY_MS) {
                lastServerTouch = now
                window.fetch("/api/session", { method: "POST" }).catch(() => {})
            }
        }
        const onActivity = () => {
            const now = Date.now()
            if (now - lastActivity >= 1000) recordActivity(now) // events fire constantly; once a second is plenty
        }

        // a tab that sat untouched (e.g. reopened after a while) starts from the newest activity in any tab
        lastActivity = readLastActivity(lastActivity)
        if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
            leave("idle")
            return
        }
        recordActivity(Date.now()) // opening a page counts as activity

        let lastSessionCheck = Date.now()
        const tick = () => {
            if (Date.now() - readLastActivity(lastActivity) > IDLE_TIMEOUT_MS) return leave("idle")
            if (document.visibilityState === "visible" && Date.now() - lastSessionCheck > SESSION_CHECK_EVERY_MS) {
                lastSessionCheck = Date.now()
                window.fetch("/api/session", { cache: "no-store" }).catch(() => { /* offline: try again later */ })
            }
        }
        const onVisible = () => {
            if (document.visibilityState !== "visible") return
            if (Date.now() - readLastActivity(lastActivity) > IDLE_TIMEOUT_MS) return leave("idle")
            lastSessionCheck = Date.now()
            window.fetch("/api/session", { cache: "no-store" }).catch(() => {})
        }

        const timer = window.setInterval(tick, CHECK_EVERY_MS)
        document.addEventListener("visibilitychange", onVisible)
        for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true })

        return () => {
            window.fetch = originalFetch
            window.clearInterval(timer)
            document.removeEventListener("visibilitychange", onVisible)
            for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
        }
    }, [])

    return null
}
