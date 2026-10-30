// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json, stubMatchMedia } from "../../helpers/uiStubs"
import type { VideoCard } from "@/app/internal_components/videos/videoTypes"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))

import ForYouFeed from "@/app/internal_components/videos/ForYouFeed"
import { ViewerProvider } from "@/app/contexts/viewer"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes; timers move on their own as well as when a test pushes them
const user = userEvent.setup({ delay: null, advanceTimers: (ms) => vi.advanceTimersByTime(ms) })

let made = 0
const card = (extra: Partial<VideoCard> = {}): VideoCard => {
    const id = `00000000-0000-4000-8000-${String(made++).padStart(12, "0")}`
    return {
        id, caption: `clip ${made}`, createdAt: "2026-10-14T00:00:00Z", status: "ready", durationS: 10, width: 720, height: 1280,
        likes: 3, favourites: 1, liked: false, favourited: false, isOwner: false,
        author: { username: "lifter", name: "Lifter", pfp: null, following: false },
        playback: { src: `https://media.example/${id}.mp4`, poster: null },
        ...extra,
    }
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>
let routes: [string, Route][]
let fetch: ReturnType<typeof vi.fn>
function stubApi(...list: [string, Route][]) {
    routes = list
    fetch = vi.fn(async (url: string, init?: RequestInit) => {
        const route = routes.find(([prefix]) => url.startsWith(prefix))
        if (!route) throw new Error(`unexpected ${url}`)
        return route[1](url, init)
    })
    vi.stubGlobal("fetch", fetch)
}
const feed = (videos: VideoCard[], extra: object = {}): Route => () => json({ videos, ads: null, ...extra })
const actions = () => screen.getByRole("list", { name: "Video actions" })
const waitPastCooldown = () => act(() => { vi.advanceTimersByTime(600) })

beforeEach(() => {
    made = 0
    vi.useFakeTimers({ shouldAdvanceTime: true })
    HTMLMediaElement.prototype.play = vi.fn(async () => {})
    HTMLMediaElement.prototype.pause = vi.fn()
    stubMatchMedia(false)
    // the feed keeps topping itself up in the background; failures of those late requests aren't the test's concern
    vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("For You feed actions", () => {
    it("likes and favourites the video, and undoes it when saving fails", async () => {
        stubApi(["/api/videos/feed", feed([card()])], ["/api/videos/", (url) => url.endsWith("/like")
            ? json({ likes: 4, favourites: 1, liked: true, favourited: false })
            : json({ message: "Verify your ID to favourite videos" }, 403)])
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        await user.click(within(actions()).getByRole("button", { name: "Like" }))
        await waitFor(() => expect(within(actions()).getByRole("button", { name: "Unlike" })).toHaveAttribute("aria-pressed", "true"))
        expect(actions()).toHaveTextContent("4")

        await user.click(within(actions()).getByRole("button", { name: "Add to favourites" }))
        expect(await screen.findByRole("status")).toHaveTextContent("Verify your ID to favourite videos")
        expect(within(actions()).getByRole("button", { name: "Add to favourites" })).toHaveAttribute("aria-pressed", "false")
        act(() => { vi.advanceTimersByTime(6100) }) // a toast with a verify link stays a little longer
        expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })

    it("sends signed-out visitors to log in instead of liking or following", async () => {
        const assign = vi.fn()
        vi.stubGlobal("location", { ...window.location, assign, origin: window.location.origin })
        stubApi(["/api/videos/feed", feed([card()])])
        render(<ViewerProvider signedIn={false}><ForYouFeed /></ViewerProvider>)
        await screen.findByLabelText(/Video 1 of/)
        await user.click(within(actions()).getByRole("button", { name: "Like" }))
        await user.click(within(actions()).getByRole("button", { name: "Follow @lifter" }))
        expect(assign).toHaveBeenCalledTimes(2)
        expect(fetch.mock.calls.every(([url]) => String(url).startsWith("/api/videos/feed"))).toBe(true)
    })

    it("follows the poster from the + badge, and says when it fails", async () => {
        let ok = true
        stubApi(["/api/videos/feed", feed([card(), card()])], ["/api/profiles/lifter/follow", () => ok ? json({ following: true, followers: 9 }) : json({ message: "Slow down" }, 429)])
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        await user.click(within(actions()).getByRole("button", { name: "Follow @lifter" }))
        expect(await screen.findByRole("status")).toHaveTextContent("Following @lifter")
        expect(within(actions()).queryByRole("button", { name: "Follow @lifter" })).not.toBeInTheDocument()

        // unfollow from the menu
        await user.click(screen.getByRole("button", { name: "More options" }))
        ok = false
        await user.click(screen.getByRole("menuitem", { name: "Unfollow @lifter" }))
        expect(await screen.findByText("Couldn't unfollow them")).toBeInTheDocument()
        ok = true
        routes.push(["/api/profiles/lifter/follow", () => json({ following: false, followers: 8 })])
        routes.reverse()
        await user.click(screen.getByRole("button", { name: "More options" }))
        await user.click(screen.getByRole("menuitem", { name: "Unfollow @lifter" }))
        expect(await screen.findByText("Unfollowed @lifter")).toBeInTheDocument()
        expect(within(actions()).getByRole("button", { name: "Follow @lifter" })).toBeInTheDocument()

        routes.reverse()
        ok = false
        await user.click(within(actions()).getByRole("button", { name: "Follow @lifter" }))
        expect(await screen.findByText("Slow down")).toBeInTheDocument()
        expect(within(actions()).getByRole("button", { name: "Follow @lifter" })).toBeInTheDocument()
    })

    it("copies a link on a computer, and opens the share sheet on a phone", async () => {
        stubApi(["/api/videos/feed", feed([card()])])
        const writeText = vi.fn(async () => {})
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        await user.click(screen.getByRole("button", { name: "More options" }))
        expect(screen.getByRole("menuitem", { name: "View @lifter" })).toHaveAttribute("href", "/profile/lifter")
        await user.click(screen.getByRole("menuitem", { name: "Copy link" }))
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?v=00000000-0000-4000-8000-000000000000`)
        expect(screen.getByRole("status")).toHaveTextContent("Link copied")

        stubMatchMedia(true)
        const share = vi.fn(async () => { throw new Error("closed") })
        Object.defineProperty(navigator, "share", { configurable: true, value: share })
        await user.click(within(actions()).getByRole("button", { name: "Share" }))
        expect(share).toHaveBeenCalledWith({ url: expect.stringContaining("/?v="), title: "@lifter on ProgressX" })
        Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    })

    it("shows your own video's menu without follow options", async () => {
        stubApi(["/api/videos/feed", feed([card({ isOwner: true, caption: "" })])])
        render(<ForYouFeed />)
        await screen.findByLabelText(/Video 1 of/)
        expect(within(actions()).queryByRole("button", { name: /Follow/ })).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "More options" }))
        expect(screen.getByRole("menuitem", { name: "Go to your profile" })).toHaveAttribute("href", "/profile")
        await user.keyboard("{Escape}")
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })

    it("pauses and plays with a tap, mutes with m, and moves with k, the wheel and swipes", async () => {
        stubApi(["/api/videos/feed", feed([card(), card(), card()])])
        render(<ForYouFeed />)
        const player = await screen.findByLabelText(/Video 1 of/)
        const video = player.querySelector("video")!
        Object.defineProperty(video, "paused", { configurable: true, value: false })
        await user.click(screen.getByRole("button", { name: "Pause" }))
        await user.click(screen.getByRole("button", { name: "Play" }))
        Object.defineProperty(video, "paused", { configurable: true, value: true }) // autoplay was blocked
        await user.click(screen.getByRole("button", { name: "Pause" }))
        expect(video.play).toHaveBeenCalled()

        expect(screen.getByRole("button", { name: "Turn sound on" })).toBeInTheDocument()
        await user.keyboard("m")
        expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()

        fireEvent.wheel(player, { deltaY: 10 }) // too small to count
        fireEvent.wheel(player, { deltaY: 100 })
        expect(await screen.findByLabelText(/Video 2 of/)).toBeInTheDocument()
        await waitPastCooldown()
        fireEvent.touchStart(player, { touches: [{ clientY: 400 }] })
        fireEvent.touchEnd(player, { changedTouches: [{ clientY: 200 }] })
        expect(await screen.findByLabelText(/Video 3 of/)).toBeInTheDocument()
        fireEvent.touchEnd(player, { changedTouches: [{ clientY: 0 }] }) // no touch started
        await waitPastCooldown()
        await user.keyboard("k")
        expect(await screen.findByLabelText(/Video 2 of/)).toBeInTheDocument()
        await waitPastCooldown()
        fireEvent.wheel(player, { deltaY: -100 })
        expect(await screen.findByLabelText(/Video 1 of/)).toBeInTheDocument()
    })

    it("ignores the arrow keys while typing in a box", async () => {
        stubApi(["/api/videos/feed", feed([card(), card()])])
        render(<><input aria-label="search" /><ForYouFeed /></>)
        await screen.findByLabelText(/Video 1 of/)
        await user.type(screen.getByRole("textbox", { name: "search" }), "j{ArrowDown}")
        expect(screen.getByLabelText(/Video 1 of/)).toBeInTheDocument()
    })

    it("says when a video can't play", async () => {
        stubApi(["/api/videos/feed", feed([card({ playback: null })])])
        render(<ForYouFeed />)
        expect(await screen.findByText("This video can't be played right now")).toBeInTheDocument()
    })

    it("offers to try again when the feed fails, and invites a first post when it's empty", async () => {
        stubApi(["/api/videos/feed", () => json({}, 500)])
        render(<ForYouFeed />)
        expect(await screen.findByText("Couldn't load videos")).toBeInTheDocument()
        routes = [["/api/videos/feed", feed([])]]
        await user.click(screen.getByRole("button", { name: "Try again" }))
        expect(await screen.findByText("No videos yet")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Post a video" })).toHaveAttribute("href", "/profile?videoSubmit=true")
    })
})

describe("Following feed", () => {
    it("pages through followed people's videos with the cursor", async () => {
        stubApi(["/api/videos/following", (url) => url.includes("cursor=c1")
            ? json({ videos: [card()], nextCursor: null })
            : json({ videos: [card(), card()], nextCursor: "c1" })])
        render(<ForYouFeed source="following" />)
        await screen.findByLabelText(/Video 1 of/)
        await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/videos/following?cursor=c1"))
        expect(fetch.mock.calls[0][0]).toBe("/api/videos/following?")
        expect(await screen.findByLabelText("Video 1 of 3")).toBeInTheDocument() // no more to come: no "+"
    })

    it("explains an empty feed, whether or not they follow anyone", async () => {
        stubApi(["/api/videos/following", () => json({ videos: [], nextCursor: null, followsAnyone: false })])
        const { unmount } = render(<ForYouFeed source="following" />)
        expect(await screen.findByText("You're not following anyone")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Go to For You" })).toHaveAttribute("href", "/")
        unmount()

        stubApi(["/api/videos/following", () => json({ videos: [], nextCursor: null })])
        render(<ForYouFeed source="following" />)
        expect(await screen.findByText("Nothing new yet")).toBeInTheDocument()
    })
})
