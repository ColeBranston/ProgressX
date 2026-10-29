// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import OtherProfile from "@/app/internal_pages/other_profile"
import { ViewerProvider } from "@/app/contexts/viewer"

// one router for every render, like Next's (the profile reloads when it changes)
const router = { replace: vi.fn(), push: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/app/internal_components/videos/VideoGrid", () => ({ default: () => <p>video grid</p> }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const profile = (shared: Record<string, boolean>) => ({
    username: "alice_lifts", name: "Alice", pfp: null, bio: "", privacy: "public", followers: 0, following: 0, likes: 0, videos: 0,
    isOwner: false, youFollow: false, followsYou: false, listsVisible: true, shared,
})

let shared: Record<string, boolean>
const requested: string[] = []

beforeEach(() => {
    requested.length = 0
    shared = { photos: false, weight: false, workouts: true, diet: true }
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        requested.push(url)
        if (url === "/api/profiles/alice_lifts") return json({ profile: profile(shared) })
        if (url.startsWith("/api/profiles/alice_lifts/tracking/workouts")) {
            return json({ weightUnit: "lb", sets: [
                { id: "s1", exerciseId: "barbell-bench-press", performedOn: "2026-10-27", weightKg: 60, reps: 8 },
                { id: "s2", exerciseId: "barbell-bench-press", performedOn: "2026-10-27", weightKg: 60, reps: 6 },
            ] })
        }
        if (url.startsWith("/api/profiles/alice_lifts/tracking/diet")) {
            return json({ date: "2026-10-27", entries: [{ id: "f1", name: "Oats", servingQty: 1, servingUnit: "cup", calories: 300, proteinG: 10, carbsG: 54, fatsG: 5 }],
                targets: { calories: 1800, protein: 150, carbs: 180, fats: 50, goal: "Deficit" } })
        }
        return json({ message: "not mocked" }, 404)
    }))
})
afterEach(() => vi.unstubAllGlobals())

const renderProfile = () => render(<ViewerProvider signedIn><OtherProfile username="alice_lifts" /></ViewerProvider>)

describe("another person's profile tabs", () => {
    it("has a tab for videos and for each kind of tracking they share, and nothing else", async () => {
        renderProfile()
        const tabs = await screen.findAllByRole("tab")
        expect(tabs.map((t) => t.textContent)).toEqual(["Videos", "Workouts", "Diet"])
        expect(screen.getByRole("tab", { name: "Videos" })).toHaveAttribute("aria-selected", "true")
        expect(requested.some((url) => url.includes("/tracking/"))).toBe(false) // nothing loads until a tab is opened
    })

    it("shows just videos when they share nothing", async () => {
        shared = { photos: false, weight: false, workouts: false, diet: false }
        renderProfile()
        expect((await screen.findAllByRole("tab")).map((t) => t.textContent)).toEqual(["Videos"])
    })

    it("shows their logged workouts and their food against their targets", async () => {
        renderProfile()
        await userEvent.click(await screen.findByRole("tab", { name: "Workouts" }))
        expect(await screen.findByText("Flat Barbell Bench Press")).toBeInTheDocument()
        expect(screen.getByText("8 × 132.3 lb · 6 × 132.3 lb")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("tab", { name: "Diet" }))
        expect(await screen.findByText("Oats")).toBeInTheDocument()
        expect(screen.getByText("Deficit")).toBeInTheDocument()
        expect(screen.getByText("Calories: 300/1800 kCal")).toBeInTheDocument()
        expect(screen.getByText("Protein: 10/150 g")).toBeInTheDocument()
    })
})
