import { describe, expect, it, vi } from "vitest"
import { canView, cleanCaption, decodeCursor, encodeCursor, olderThan, overLimit, UUID } from "@/app/api/libs/videos"
import { CAPTION_MAX, formatCount, formatDuration } from "@/app/internal_components/videos/videoTypes"

const id = "4dac653a-5ef1-4dfb-ba14-f05c2738d52b"

describe("cursors", () => {
    it("round-trips (created_at, id)", () => {
        const cursor = encodeCursor({ created_at: "2026-10-01T12:00:00.123Z", id })
        expect(cursor).not.toMatch(/[+/=]/) // URL safe
        expect(decodeCursor(cursor)).toEqual({ createdAt: "2026-10-01T12:00:00.123Z", id })
    })
    it.each([null, "", "x".repeat(201), Buffer.from("not a date|" + id).toString("base64url"), Buffer.from("2026-10-01|nope").toString("base64url")])(
        "rejects tampered cursor %j", (raw) => expect(decodeCursor(raw)).toBeNull(),
    )
    it("builds a keyset filter that quotes the timestamp", () => {
        expect(olderThan({ createdAt: "2026-10-01T12:00:00Z", id })).toBe(
            `created_at.lt."2026-10-01T12:00:00Z",and(created_at.eq."2026-10-01T12:00:00Z",id.lt.${id})`,
        )
        expect(olderThan({ createdAt: "t", id }, "liked_at", "video_id")).toContain("liked_at.eq.\"t\",video_id.lt.")
    })
})

describe("cleanCaption", () => {
    it("treats a missing caption as empty", () => {
        expect(cleanCaption(undefined)).toBe("")
        expect(cleanCaption(null)).toBe("")
    })
    it("strips control characters, keeps new lines and squeezes blank lines", () => {
        expect(cleanCaption("  Leg\u0000 day​\n\n\n\nPR!  ")).toBe("Leg day\n\nPR!")
    })
    it("rejects non-strings and captions over the limit", () => {
        expect(cleanCaption(12)).toBeNull()
        expect(cleanCaption("x".repeat(CAPTION_MAX + 1))).toBeNull()
        expect(cleanCaption("x".repeat(CAPTION_MAX))).toHaveLength(CAPTION_MAX)
    })
})

describe("canView", () => {
    const viewer = "viewer"
    it("lets the owner see every status", () => {
        expect(canView({ user_id: viewer, status: "uploading" }, { profile_privacy: "private" }, viewer)).toBe(true)
    })
    it("only shows other people's ready videos from public profiles", () => {
        expect(canView({ user_id: "a", status: "ready" }, { profile_privacy: "public" }, viewer)).toBe(true)
        expect(canView({ user_id: "a", status: "ready" }, { profile_privacy: "private" }, viewer)).toBe(false)
        expect(canView({ user_id: "a", status: "uploading" }, { profile_privacy: "public" }, viewer)).toBe(false)
        expect(canView({ user_id: "a", status: "ready" }, null, viewer)).toBe(false)
    })
})

describe("overLimit", () => {
    it("allows max hits per window, then blocks until the window passes", () => {
        vi.useFakeTimers()
        try {
            const key = `test-${Math.random()}`
            expect([1, 2, 3].map(() => overLimit(key, 3, 1000))).toEqual([false, false, false])
            expect(overLimit(key, 3, 1000)).toBe(true)
            vi.advanceTimersByTime(1001)
            expect(overLimit(key, 3, 1000)).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })
})

describe("UUID / formatting", () => {
    it("UUID only matches lowercase ids", () => {
        expect(UUID.test(id)).toBe(true)
        expect(UUID.test(id.toUpperCase())).toBe(false)
    })
    it.each([[0, "0"], [999, "999"], [1000, "1K"], [1234, "1.2K"], [12_345, "12K"], [1_000_000, "1M"], [2_450_000, "2.5M"]])(
        "formatCount(%d) = %s", (n, text) => expect(formatCount(n)).toBe(text),
    )
    it("formats durations as m:ss", () => {
        expect(formatDuration(null)).toBe("")
        expect(formatDuration(5)).toBe("0:05")
        expect(formatDuration(179.6)).toBe("3:00")
    })
})
