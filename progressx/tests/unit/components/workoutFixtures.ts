import dayjs from "dayjs"
import { vi } from "vitest"
import type { SplitDay } from "@/app/internal_components/mystats/exercises"
import type { WorkoutSet, WorkoutSplit } from "@/app/internal_components/mystats/workoutStats"

// Browser APIs jsdom doesn't have, for the My Stats charts and exercise animations: a width so charts
// draw, no-op observers, and a matchMedia that says whether the user prefers reduced motion
export function stubLayout({ width = 800, reducedMotion = false } = {}) {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width)
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reducedMotion && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }))
}

export const day = (offset: number) => dayjs().subtract(offset, "day").format("YYYY-MM-DD")
export const TODAY = day(0)

let nextId = 1
export function makeSet(overrides: Partial<WorkoutSet> & { exercise_id: string }): WorkoutSet {
    const id = `set-${nextId++}`
    return {
        id,
        performed_on: TODAY,
        weight_kg: 100,
        reps: 5,
        split_id: null,
        split_day_index: null,
        created_at: `2026-01-01T00:00:${String(nextId % 60).padStart(2, "0")}Z`,
        ...overrides,
    }
}

export function makeSplit(overrides: Partial<WorkoutSplit> & { id: string, days: SplitDay[] }): WorkoutSplit {
    return { name: "My split", is_active: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides }
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
