// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"
import VideoGrid from "@/app/internal_components/videos/VideoGrid"
import { ViewerProvider } from "@/app/contexts/viewer"
import type { VideoCard } from "@/app/internal_components/videos/videoTypes"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const card = (id: string, extra: Partial<VideoCard> = {}): VideoCard => ({
    id, caption: `clip ${id}`, createdAt: "2026-10-14T12:00:00Z", status: "ready", durationS: 65, width: 720, height: 1280,
    likes: 1200, favourites: 3, liked: false, favourited: false, isOwner: false,
    author: { username: "lifter", name: "Lifter", pfp: null, following: false },
    playback: { src: `https://media.example/${id}.mp4`, poster: `https://media.example/${id}.jpg` },
    ...extra,
})

type Route = (init?: RequestInit) => Response | Promise<Response>
let routes: Record<string, Route>
let fetch: ReturnType<typeof vi.fn>
function stubApi(more: Record<string, Route>) {
    routes = more
    fetch = vi.fn(async (url: string, init?: RequestInit) => {
        const route = routes[url]
        if (!route) throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`)
        return route(init)
    })
    vi.stubGlobal("fetch", fetch)
}
const page = (videos: VideoCard[], nextCursor: string | null = null) => () => json({ videos, nextCursor })
const viewer = () => screen.getByRole("dialog")

beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(async () => {})
    HTMLMediaElement.prototype.pause = vi.fn()
})
afterEach(() => {
    vi.unstubAllGlobals()
})

describe("VideoGrid", () => {
    it("shows a profile's videos as thumbnails with likes and length", async () => {
        stubApi({ "/api/videos?user=lifter&tab=videos": page([card("a"), card("b", { caption: "", playback: { src: "https://media.example/b.mp4", poster: null } })]) })
        const { container } = render(<VideoGrid user="lifter" tab="videos" empty={<p>nothing</p>} />)
        expect(screen.getByRole("status", { name: "Loading videos" })).toBeInTheDocument()
        // placeholder shapes, not a spinner
        expect(screen.getByRole("status", { name: "Loading videos" }).querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0)
        const tile = await screen.findByRole("button", { name: "Play clip a" })
        expect(tile).toHaveTextContent("1.2K")
        expect(tile).toHaveTextContent("1:05")
        expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument()
        expect(container.querySelector("video")).toHaveAttribute("src", "https://media.example/b.mp4#t=0.5") // no poster: an early frame
        expect(screen.queryByText("@lifter")).not.toBeInTheDocument()
    })

    it("shows the empty message alone, or beside the leading tile", async () => {
        stubApi({ "/api/videos?user=me&tab=liked": page([]) })
        const { unmount } = render(<VideoGrid tab="liked" empty={<p>no likes yet</p>} />)
        expect(await screen.findByText("no likes yet")).toBeInTheDocument()
        unmount()
        stubApi({ "/api/videos?user=me&tab=videos": page([]) })
        render(<VideoGrid tab="videos" leading={<button type="button">Add video</button>} empty={<p>no videos yet</p>} />)
        expect(await screen.findByText("no videos yet")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Add video" })).toBeInTheDocument()
    })

    it("searches videos, and loads more without repeating any", async () => {
        stubApi({
            "/api/find?q=squat&type=videos": page([card("a"), card("b")], "next"),
            "/api/find?q=squat&type=videos&cursor=next": page([card("b"), card("c")]),
        })
        render(<VideoGrid tab="search" search="squat" empty={<p>none</p>} />)
        await screen.findByRole("button", { name: "Play clip a" })
        expect(screen.getAllByText("@lifter")).toHaveLength(2) // other people's videos show who posted them
        await user.click(screen.getByRole("button", { name: "Load more" }))
        await screen.findByRole("button", { name: "Play clip c" })
        expect(screen.getAllByRole("button", { name: /^Play clip/ })).toHaveLength(3)
        expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument()
    })

    it("explains a private account, a failed load, and a failed next page", async () => {
        stubApi({ "/api/videos?user=hidden&tab=videos": () => json({ private: true }, 403) })
        const { unmount } = render(<VideoGrid user="hidden" tab="videos" empty={null} />)
        expect(await screen.findByText("This account is private")).toBeInTheDocument()
        unmount()

        stubApi({ "/api/videos?user=x&tab=videos": () => new Response("down", { status: 500 }) })
        const second = render(<VideoGrid user="x" tab="videos" empty={null} />)
        expect(await screen.findByText("Couldn't load videos")).toBeInTheDocument()
        second.unmount()

        stubApi({
            "/api/videos?user=y&tab=videos": page([card("a")], "2"),
            "/api/videos?user=y&tab=videos&cursor=2": () => json({ message: "Slow down" }, 429),
        })
        render(<VideoGrid user="y" tab="videos" empty={null} />)
        await user.click(await screen.findByRole("button", { name: "Load more" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Slow down")
        expect(screen.getByRole("button", { name: "Play clip a" })).toBeInTheDocument()
    })

    it("reloads when asked to (after an upload)", async () => {
        stubApi({ "/api/videos?user=me&tab=videos": page([card("a")]) })
        const { rerender } = render(<VideoGrid tab="videos" refreshKey={0} empty={null} />)
        await screen.findByRole("button", { name: "Play clip a" })
        routes["/api/videos?user=me&tab=videos"] = page([card("new"), card("a")])
        rerender(<VideoGrid tab="videos" refreshKey={1} empty={null} />)
        expect(await screen.findByRole("button", { name: "Play clip new" })).toBeInTheDocument()
    })

    it("lets you remove your own unfinished or failed uploads", async () => {
        stubApi({
            "/api/videos?user=me&tab=videos": page([
                card("up", { status: "uploading", isOwner: true }),
                card("bad", { status: "failed", isOwner: true }),
                card("gone", { playback: null }),
            ]),
            "/api/videos/up": () => json({}),
            "/api/videos/bad": () => json({ message: "Try again later" }, 500),
        })
        render(<VideoGrid tab="videos" empty={null} />)
        expect(await screen.findByText("This upload didn't finish")).toBeInTheDocument()
        expect(screen.getByText("Couldn't post this video")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Video unavailable" })).toBeDisabled()

        const [removeUnfinished, removeFailed] = screen.getAllByRole("button", { name: "Remove" })
        await user.click(removeUnfinished)
        await waitFor(() => expect(screen.queryByText("This upload didn't finish")).not.toBeInTheDocument())
        await user.click(removeFailed)
        expect(await screen.findByRole("alert")).toHaveTextContent("Try again later")

        routes["/api/videos/bad"] = () => new Response("", { status: 500 })
        await user.click(screen.getByRole("button", { name: "Remove" }))
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't remove that video"))
    })

    it("opens a video in the viewer and steps through the grid", async () => {
        stubApi({ "/api/videos?user=lifter&tab=videos": page([card("a"), card("b"), card("c")]) })
        render(<VideoGrid user="lifter" tab="videos" empty={null} />)
        await user.click(await screen.findByRole("button", { name: "Play clip b" }))
        expect(viewer()).toHaveAccessibleName("clip b")
        expect(within(viewer()).getByRole("button", { name: "Close" })).toHaveFocus()
        expect(within(viewer()).getByRole("link", { name: /@lifter/ })).toHaveAttribute("href", "/profile/lifter")

        await user.click(within(viewer()).getByRole("button", { name: "Next video" }))
        expect(viewer()).toHaveAccessibleName("clip c")
        expect(within(viewer()).queryByRole("button", { name: "Next video" })).not.toBeInTheDocument()
        await user.keyboard("{ArrowRight}") // already the last
        await user.keyboard("{ArrowLeft}")
        await user.keyboard("{ArrowLeft}")
        expect(viewer()).toHaveAccessibleName("clip a")
        await user.keyboard("{ArrowLeft}") // already the first
        await user.click(within(viewer()).getByRole("button", { name: "Next video" }))
        await user.click(within(viewer()).getByRole("button", { name: "Previous video" }))
        expect(viewer()).toHaveAccessibleName("clip a")

        await user.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Play clip b" })).toBeInTheDocument()
    })

    it("takes an un-liked video off your liked list once the viewer closes", async () => {
        stubApi({
            "/api/videos?user=me&tab=liked": page([card("a", { liked: true, likes: 5 }), card("b", { liked: true })]),
            "/api/videos/a/like": () => json({ likes: 4, favourites: 3, liked: false, favourited: false }),
        })
        render(<VideoGrid tab="liked" empty={<p>no likes</p>} />)
        await user.click(await screen.findByRole("button", { name: "Play clip a" }))
        await user.click(within(viewer()).getByRole("button", { name: /Unlike/ }))
        await waitFor(() => expect(within(viewer()).getByRole("button", { name: /Like/ })).toHaveAttribute("aria-pressed", "false"))
        expect(within(viewer()).getByRole("button", { name: /Like/ })).toHaveTextContent("4")
        expect(screen.getByRole("button", { name: "Play clip a" })).toBeInTheDocument() // still there while open
        await user.click(within(viewer()).getByRole("button", { name: "Close" }))
        expect(screen.queryByRole("button", { name: "Play clip a" })).not.toBeInTheDocument()
    })

    it("takes an un-favourited video off your favourites once the viewer closes", async () => {
        stubApi({
            "/api/videos?user=me&tab=favourites": page([card("a", { favourited: true, favourites: 1 })]),
            "/api/videos/a/favourite": () => json({ likes: 1200, favourites: 0, liked: false, favourited: false }),
        })
        render(<VideoGrid tab="favourites" empty={<p>no favourites</p>} />)
        await user.click(await screen.findByRole("button", { name: "Play clip a" }))
        await user.click(within(viewer()).getByRole("button", { name: /Remove from favourites/ }))
        await waitFor(() => expect(within(viewer()).getByRole("button", { name: /Favourite/ })).toHaveAttribute("aria-pressed", "false"))
        await user.click(viewer().parentElement!) // the backdrop
        expect(await screen.findByText("no favourites")).toBeInTheDocument()
    })
})

describe("VideoViewer", () => {
    async function openOwn(extra: Partial<VideoCard> = {}, signedIn = true) {
        stubApi({ "/api/videos?user=me&tab=videos": page([card("mine", { isOwner: true, ...extra })]) })
        render(<ViewerProvider signedIn={signedIn}><VideoGrid tab="videos" empty={null} /></ViewerProvider>)
        await user.click(await screen.findByRole("button", { name: /^Play/ }))
        return viewer()
    }

    it("likes and favourites, and undoes the change when saving fails", async () => {
        const dialog = await openOwn()
        expect(within(dialog).getByRole("link", { name: /@lifter/ })).toHaveAttribute("href", "/profile")
        routes["/api/videos/mine/like"] = () => json({ likes: 1201, favourites: 3, liked: true, favourited: false })
        await user.click(within(dialog).getByRole("button", { name: /Like/ }))
        await waitFor(() => expect(within(dialog).getByRole("button", { name: /Unlike/ })).toHaveAttribute("aria-pressed", "true"))

        routes["/api/videos/mine/favourite"] = () => json({ message: "Slow down" }, 429)
        await user.click(within(dialog).getByRole("button", { name: /Favourite/ }))
        expect(await within(dialog).findByRole("status")).toHaveTextContent("Slow down")
        expect(within(dialog).getByRole("button", { name: /Favourite/ })).toHaveAttribute("aria-pressed", "false")
        expect(within(dialog).getByRole("button", { name: /Favourite/ })).toHaveTextContent("3")
    })

    it("sends signed-out visitors to log in instead of liking", async () => {
        const assign = vi.fn()
        vi.stubGlobal("location", { ...window.location, assign, origin: window.location.origin })
        const dialog = await openOwn({}, false)
        await user.click(within(dialog).getByRole("button", { name: /Like/ }))
        expect(assign).toHaveBeenCalledWith("/login")
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it("copies a link to the video", async () => {
        const dialog = await openOwn()
        const writeText = vi.fn(async () => {})
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        await user.click(within(dialog).getByRole("button", { name: "Copy link" }))
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?v=mine`)
        expect(within(dialog).getByRole("status")).toHaveTextContent("Link copied")

        writeText.mockRejectedValueOnce(new Error("denied"))
        await user.click(within(dialog).getByRole("button", { name: "Copy link" }))
        expect(within(dialog).getByRole("status")).toHaveTextContent("Couldn't copy the link")
    })

    it("deletes your own video after confirming", async () => {
        const dialog = await openOwn()
        await user.click(within(dialog).getByRole("button", { name: "Delete video" }))
        await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
        await user.click(within(dialog).getByRole("button", { name: "Delete video" }))
        expect(dialog).toHaveTextContent("Delete this video? Its likes and favourites go with it.")

        routes["/api/videos/mine"] = () => json({ message: "Not now" }, 500)
        await user.click(within(dialog).getByRole("button", { name: "Delete" }))
        expect(await within(dialog).findByRole("status")).toHaveTextContent("Not now")
        routes["/api/videos/mine"] = () => new Response("", { status: 500 })
        await user.click(within(dialog).getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Couldn't delete the video"))

        routes["/api/videos/mine"] = () => json({})
        await user.click(within(dialog).getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument()
    })

    it("pauses, plays and mutes, and says when the video can't play", async () => {
        const dialog = await openOwn({ caption: "" })
        expect(dialog).toHaveAccessibleName("Video by @lifter")
        const video = dialog.querySelector("video")!
        Object.defineProperty(video, "paused", { configurable: true, value: false }) // playing
        await user.click(within(dialog).getByRole("button", { name: "Pause" }))
        expect(within(dialog).getByRole("button", { name: "Play" })).toBeInTheDocument()
        await user.click(within(dialog).getByRole("button", { name: "Play" }))
        expect(within(dialog).getByRole("button", { name: "Pause" })).toBeInTheDocument()

        // autoplay was blocked: the first tap starts it instead of pausing
        Object.defineProperty(video, "paused", { configurable: true, value: true })
        await user.click(within(dialog).getByRole("button", { name: "Pause" }))
        expect(video.play).toHaveBeenCalled()
        expect(within(dialog).getByRole("button", { name: "Pause" })).toBeInTheDocument()

        await user.click(within(dialog).getByRole("button", { name: "Mute" }))
        expect(within(dialog).getByRole("button", { name: "Turn sound on" })).toHaveAttribute("aria-pressed", "false")

        fireEvent.error(video)
        expect(dialog).toHaveTextContent("This video can't be played right now")
    })
})
