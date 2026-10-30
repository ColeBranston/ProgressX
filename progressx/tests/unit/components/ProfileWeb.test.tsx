// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"

const replace = vi.fn()
const router = { replace, push: vi.fn() }
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/profile", useSearchParams: () => search }))
// the tabs' contents have their own tests: stand-ins that say what they were asked to show
vi.mock("@/app/internal_components/videos/VideoGrid", () => ({
    default: ({ tab, refreshKey, leading, empty }: { tab: string, refreshKey?: number, leading?: React.ReactNode, empty: React.ReactNode }) => (
        <section aria-label={`grid ${tab}`} data-refresh={refreshKey}>{leading}{empty}</section>
    ),
}))
vi.mock("@/app/internal_components/videos/VideoUploadForm", () => ({
    default: ({ onClose, onUploaded }: { onClose: () => void, onUploaded: () => void }) => (
        <div role="dialog" aria-label="Upload video"><button type="button" onClick={onUploaded}>uploaded</button><button type="button" onClick={onClose}>close upload</button></div>
    ),
}))
vi.mock("@/app/internal_components/profile/ProgressPhotosComponent", () => ({ default: () => <p>progress photos</p> }))
vi.mock("@/app/internal_components/follows/FollowList", () => ({
    default: ({ initial, counts, onClose }: { initial: string, counts: { followers: number, following: number }, onClose: () => void }) => (
        <div role="dialog" aria-label={`list ${initial}`}>{counts.followers}/{counts.following}<button type="button" onClick={onClose}>close list</button></div>
    ),
}))

import ProfileWeb from "@/app/internal_pages/profile_web"
import { userDataContext, UserData } from "@/app/contexts/userData"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const ME: UserData = { username: "lifter", name: "Lee", pfp: null, bio: null, privacy: "public", followers: 1, following: 2, likes: 3 }
let latest: UserData
function Harness({ start = ME }: { start?: UserData }) {
    const [userData, setUserData] = useState<UserData>(start)
    latest = userData
    return <userDataContext.Provider value={{ userData, setUserData }}><ProfileWeb /></userDataContext.Provider>
}
let routes: Record<string, (init?: RequestInit) => Response>
function stubApi() {
    routes = {
        "/api/user": () => json({ userData: { followers_count: 10, following_count: 2, likes_count: 3 } }),
        "api/user/userImages/uploadProfileImage": () => json({ imageReference: "https://res.cloudinary.com/demo/image/upload/new.jpg" }),
    }
    const fetch = vi.fn(async (url: string, init?: RequestInit) => routes[url](init))
    vi.stubGlobal("fetch", fetch)
    return fetch
}
const photoInput = () => document.querySelector("input[type=file]") as HTMLInputElement
const picture = (type = "image/png", size = 100) => {
    const file = new File(["x"], "me.png", { type })
    Object.defineProperty(file, "size", { value: size })
    return file
}

beforeEach(() => {
    search = new URLSearchParams()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.stubGlobal("alert", vi.fn())
    stubApi()
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("your profile", () => {
    it("shows your details and refreshes the counts from the server", async () => {
        render(<Harness />)
        expect(screen.getByText("lifter")).toBeInTheDocument()
        expect(screen.getByText("Lee")).toBeInTheDocument()
        expect(screen.getByText("No Bio Yet")).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Profile picture" })).toHaveAttribute("src", expect.stringContaining("male_default.svg"))
        expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
        expect(await screen.findByRole("button", { name: "10Followers" })).toBeInTheDocument()
        expect(latest.followers).toBe(10)
    })

    it("keeps the counts when the server has nothing new, or can't be reached", async () => {
        routes["/api/user"] = () => json({ userData: { followers_count: 1, following_count: 2, likes_count: 3 } })
        const { unmount } = render(<Harness />)
        await waitFor(() => expect(fetch).toHaveBeenCalled())
        expect(screen.getByRole("button", { name: "1Followers" })).toBeInTheDocument()
        unmount()

        for (const answer of [() => json({}, 401), () => json({}), () => new Response("not json")]) {
            routes["/api/user"] = answer
            const view = render(<Harness />)
            await waitFor(() => expect(fetch).toHaveBeenCalled())
            expect(screen.getByRole("button", { name: "1Followers" })).toBeInTheDocument()
            view.unmount()
        }
        vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"))
        render(<Harness start={{ ...ME, followers: null, following: null, likes: null }} />)
        expect(screen.getByRole("button", { name: "0Followers" })).toBeInTheDocument()
    })

    it("switches between the four tabs", async () => {
        render(<Harness />)
        expect(screen.getByRole("region", { name: "grid videos" })).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Progress Photos" }))
        expect(screen.getByText("progress photos")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Favourites" }))
        expect(screen.getByRole("region", { name: "grid favourites" })).toHaveTextContent("Favourite videos you see and they will show up here")
        await user.click(screen.getByRole("button", { name: "Liked" }))
        expect(screen.getByRole("region", { name: "grid liked" })).toHaveTextContent("Like videos you see and they will show up here")
        await user.click(screen.getByRole("button", { name: "Videos" }))
        expect(screen.getByRole("region", { name: "grid videos" })).toBeInTheDocument()
    })

    it.each([["videos", "grid videos"], ["favourites", "grid favourites"], ["liked", "grid liked"]])("opens on the %s tab from the address", (page, grid) => {
        search = new URLSearchParams({ page })
        render(<Harness />)
        expect(screen.getByRole("region", { name: grid })).toBeInTheDocument()
    })

    it("opens on the photos tab from the address, and ignores an unknown tab", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        search = new URLSearchParams({ page: "photos" })
        const { unmount } = render(<Harness />)
        expect(screen.getByText("progress photos")).toBeInTheDocument()
        unmount()
        search = new URLSearchParams({ page: "nope" })
        render(<Harness />)
        expect(error).toHaveBeenCalledWith("Page Param Doesn't Exist: ", "nope")
        expect(screen.getByRole("region", { name: "grid videos" })).toBeInTheDocument()
    })

    it("opens the video upload form from the tile or the address, and reloads the grid after an upload", async () => {
        search = new URLSearchParams({ page: "videos", videoSubmit: "true" })
        render(<Harness />)
        expect(screen.getByRole("dialog", { name: "Upload video" })).toBeInTheDocument()
        expect(replace).toHaveBeenCalledWith("/profile?page=videos")
        await user.click(screen.getByRole("button", { name: "uploaded" }))
        expect(screen.getByRole("region", { name: "grid videos" })).toHaveAttribute("data-refresh", "1")
        await user.click(screen.getByRole("button", { name: "close upload" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Add video" }))
        expect(screen.getByRole("dialog", { name: "Upload video" })).toBeInTheDocument()
    })

    it("drops the upload flag without leaving a stray ?", () => {
        search = new URLSearchParams({ videoSubmit: "true" })
        render(<Harness />)
        expect(replace).toHaveBeenCalledWith("/profile")
    })

    it("opens the follower and following lists, and refreshes the counts when one closes", async () => {
        const fetch = stubApi()
        render(<Harness />)
        await user.click(await screen.findByRole("button", { name: "10Followers" }))
        expect(screen.getByRole("dialog", { name: "list followers" })).toHaveTextContent("10/2")
        await user.click(screen.getByRole("button", { name: "close list" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
        await user.click(screen.getByRole("button", { name: "2Following" }))
        expect(screen.getByRole("dialog", { name: "list following" })).toBeInTheDocument()
    })

    it("edits the bio and privacy only while editing", async () => {
        render(<Harness />)
        const lock = () => screen.getByText("lifter").nextElementSibling as SVGElement
        fireEvent.click(lock()) // not editing: nothing changes
        expect(latest.privacy).toBe("public")

        await user.click(screen.getByRole("button", { name: "Edit Profile" }))
        fireEvent.click(lock())
        expect(latest.privacy).toBe("private")
        fireEvent.click(lock())
        expect(latest.privacy).toBe("public")
        await user.type(screen.getByPlaceholderText("No Bio Yet"), "Squats")
        expect(latest.bio).toBe("Squats")

        await user.click(screen.getByRole("button", { name: "Save Profile" }))
        expect(screen.getByText("Squats")).toBeInTheDocument()
        fireEvent.click(lock())
        expect(latest.privacy).toBe("public")
        render(<Harness start={{ ...ME, privacy: "private" }} />)
        fireEvent.click(screen.getAllByText("lifter")[1].nextElementSibling!)
        expect(latest.privacy).toBe("private")
    })

    it("uploads a new profile picture while editing", async () => {
        const fetch = stubApi()
        render(<Harness start={{ ...ME, pfp: "https://res.cloudinary.com/demo/image/upload/old.jpg", bio: "Lifting" }} />)
        expect(screen.getByText("Lifting")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Edit Profile" }))
        expect(screen.getByPlaceholderText("Lifting")).toBeInTheDocument()
        const click = vi.spyOn(photoInput(), "click")
        await user.click(screen.getByRole("button", { name: "Change profile picture" }))
        expect(click).toHaveBeenCalled()

        await user.upload(photoInput(), picture())
        await waitFor(() => expect(latest.pfp).toBe("https://res.cloudinary.com/demo/image/upload/new.jpg"))
        expect(fetch).toHaveBeenCalledWith("api/user/userImages/uploadProfileImage", { method: "POST", body: expect.any(FormData) })
        expect(screen.getByRole("button", { name: "Edit Profile" })).toBeInTheDocument()
    })

    it("explains a profile picture it can't use", async () => {
        render(<Harness />)
        await user.click(screen.getByRole("button", { name: "Edit Profile" }))
        fireEvent.change(photoInput(), { target: { files: [] } })
        fireEvent.change(photoInput(), { target: { files: [picture("text/plain")] } })
        expect(alert).toHaveBeenLastCalledWith("That file isn't an image. Choose a JPG, PNG, WebP or HEIC photo.")
        fireEvent.change(photoInput(), { target: { files: [picture("image/png", 11 * 1024 * 1024)] } })
        expect(alert).toHaveBeenLastCalledWith("That photo is over 10 MB. Choose a smaller one.")

        routes["api/user/userImages/uploadProfileImage"] = () => json({}, 429)
        fireEvent.change(photoInput(), { target: { files: [picture()] } })
        await waitFor(() => expect(alert).toHaveBeenLastCalledWith("You're uploading too quickly. Wait a few seconds and try again."))
        routes["api/user/userImages/uploadProfileImage"] = () => json({ message: "Unsupported image" }, 400)
        fireEvent.change(photoInput(), { target: { files: [picture()] } })
        await waitFor(() => expect(alert).toHaveBeenLastCalledWith("Unsupported image"))
        routes["api/user/userImages/uploadProfileImage"] = () => new Response("boom", { status: 500 })
        fireEvent.change(photoInput(), { target: { files: [picture()] } })
        await waitFor(() => expect(alert).toHaveBeenLastCalledWith("Couldn't update your profile picture."))
        expect(within(document.body).getByRole("button", { name: "Save Profile" })).toBeInTheDocument()
    })
})
