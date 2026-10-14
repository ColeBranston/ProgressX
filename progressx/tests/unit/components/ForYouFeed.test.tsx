// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VideoCard } from "@/app/internal_components/videos/videoTypes"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
// Google's ad player can't run here: a stand-in that reports when its ad starts or ends
vi.mock("@/app/internal_components/videos/AdSlot", () => ({
    default: ({ active, onStarted, onDone }: { active: boolean, onStarted: () => void, onDone: (o: string) => void }) => (
        <div data-testid="ad" data-active={active}>
            <button type="button" onClick={onStarted}>ad starts</button>
            <button type="button" onClick={() => onDone("completed")}>ad ends</button>
        </div>
    ),
}))

import ForYouFeed from "@/app/internal_components/videos/ForYouFeed"

let made = 0
const card = (): VideoCard => {
    const id = `00000000-0000-4000-8000-${String(made++).padStart(12, "0")}`
    return {
        id, caption: `clip ${id.slice(-3)}`, createdAt: "2026-10-14T00:00:00Z", status: "ready", durationS: 10, width: 720, height: 1280,
        likes: 0, favourites: 0, liked: false, favourited: false, isOwner: false,
        author: { username: "lifter", name: "Lifter", pfp: null, following: true },
        playback: { src: `https://media.example/${id}.mp4`, poster: null },
    }
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
const adSettings = { tagUrl: "https://ads.example/tag", firstAfter: 4, every: 6, minGapSeconds: 45 }

function stubFeed(ads: typeof adSettings | null = null) {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => json({ videos: Array.from({ length: 5 }, card), ads }))
    vi.stubGlobal("fetch", fetch)
    return fetch
}
const videos = () => document.querySelectorAll("video")
const next = async () => {
    await userEvent.keyboard("{ArrowDown}")
    act(() => { vi.advanceTimersByTime(600) }) // past the swipe cooldown
}

beforeEach(() => {
    made = 0
    vi.useFakeTimers({ shouldAdvanceTime: true })
    HTMLMediaElement.prototype.play = vi.fn(async () => {})
    HTMLMediaElement.prototype.pause = vi.fn()
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("ForYouFeed", () => {
    it("keeps 5 videos ready ahead, at most 10 loaded, and tells the server what it has shown", async () => {
        const fetch = stubFeed()
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        // 5 fetched, but fewer than 5 queued after the first: a second batch comes straight away
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
        expect(videos()).toHaveLength(6) // the current one and the 5 ahead
        const ahead = [...videos()].slice(1).map((v) => v.getAttribute("preload"))
        expect(ahead).toEqual(["auto", "auto", "auto", "auto", "auto"])

        for (let i = 0; i < 6; i++) await next()
        await screen.findByLabelText(/Video 7 of/)
        await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(3))
        expect(videos().length).toBeLessThanOrEqual(10) // the oldest ones were unloaded
        const lastUrl = new URL(String(fetch.mock.calls.at(-1)![0]), "https://progressx.ca")
        const seen = lastUrl.searchParams.get("seen")!.split(",")
        expect(seen[0]).toBe("00000000-0000-4000-8000-000000000009") // newest first
        expect(seen).toHaveLength(10)
    })

    it("plays an ad after the 4th video, then moves on to the next video when it ends", async () => {
        stubFeed(adSettings)
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        for (let i = 0; i < 4; i++) await next()

        expect(await screen.findByLabelText("Sponsored video")).toBeInTheDocument()
        expect(screen.getByTestId("ad")).toHaveAttribute("data-active", "true")
        expect(screen.queryByRole("list", { name: "Video actions" })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "ad starts" }))
        await userEvent.click(screen.getByRole("button", { name: "ad ends" }))

        expect(await screen.findByLabelText(/Video 5 of/)).toBeInTheDocument()
        expect(screen.getByRole("list", { name: "Video actions" })).toBeInTheDocument()
    })

    it("skips an ad slot reached too soon after the last ad", async () => {
        stubFeed({ ...adSettings, firstAfter: 1, every: 2 })
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        await next()
        await userEvent.click(await screen.findByRole("button", { name: "ad starts" }))
        await userEvent.click(screen.getByRole("button", { name: "ad ends" }))
        await screen.findByLabelText(/Video 2 of/)

        await next() // video 3
        await next() // would be an ad, but only seconds after the last one
        expect(await screen.findByLabelText(/Video 4 of/)).toBeInTheDocument()
        expect(screen.queryByLabelText("Sponsored video")).not.toBeInTheDocument()
    })

    it("lets you move past an ad with the Next video button", async () => {
        stubFeed(adSettings)
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        for (let i = 0; i < 4; i++) await next()
        await screen.findByLabelText("Sponsored video")

        await userEvent.click(screen.getByText("Next video", { selector: "button" })) // the on-ad button (the desktop arrow has no text)
        expect(await screen.findByLabelText(/Video 6 of/)).toBeInTheDocument()
    })

    it("shows no ads when they're off", async () => {
        stubFeed(null)
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        for (let i = 0; i < 6; i++) await next()
        expect(screen.queryByTestId("ad")).not.toBeInTheDocument()
        expect(await screen.findByLabelText(/Video 7 of/)).toBeInTheDocument()
    })
})
