import { describe, expect, it, vi } from "vitest"
import { fetchAllPages, isDateString, readDateRange } from "@/app/api/libs/dateRange"

const params = (from?: string, to?: string) => new URLSearchParams({ ...(from && { from }), ...(to && { to }) })

describe("readDateRange", () => {
    it("returns an inclusive range", () => {
        expect(readDateRange(params("2026-01-01", "2026-01-31"))).toEqual({ from: "2026-01-01", to: "2026-01-31" })
        expect(readDateRange(params("2026-01-01", "2026-01-01"))).toEqual({ from: "2026-01-01", to: "2026-01-01" })
    })
    it("rejects missing, malformed, reversed and too-long ranges", () => {
        expect(readDateRange(params("2026-01-01"))).toBeNull()
        expect(readDateRange(params("2026-1-1", "2026-01-02"))).toBeNull()
        expect(readDateRange(params("2026-02-01", "2026-01-01"))).toBeNull()
        expect(readDateRange(params("2026-01-01", "2026-01-11"), 9)).toBeNull()
        expect(readDateRange(params("2026-01-01", "2026-01-10"), 9)).not.toBeNull()
    })
})

describe("isDateString", () => {
    it("only accepts YYYY-MM-DD strings that parse", () => {
        expect(isDateString("2026-10-09")).toBe(true)
        expect(isDateString("2026-13-40")).toBe(false)
        expect(isDateString(20261009)).toBe(false)
    })
})

describe("fetchAllPages", () => {
    it("keeps requesting 1000-row pages until a short page", async () => {
        const total = 2500
        const query = vi.fn(async (from: number, to: number) => ({
            data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i),
            error: null,
        }))
        const rows = await fetchAllPages(query)
        expect(rows).toHaveLength(total)
        expect(query.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    })
    it("throws the database error", async () => {
        await expect(fetchAllPages(async () => ({ data: null, error: new Error("boom") }))).rejects.toThrow("boom")
    })
})
