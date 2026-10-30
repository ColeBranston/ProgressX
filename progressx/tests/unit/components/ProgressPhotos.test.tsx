// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FakeIntersectionObserver, json, stubIntersectionObserver } from "../../helpers/uiStubs"

const replace = vi.fn()
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), useSearchParams: () => search }))

import ProgressPhotosComponent, { ProgressPhoto } from "@/app/internal_components/profile/ProgressPhotosComponent"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const photo = (id: string, created_at: string): ProgressPhoto => ({ id, created_at, image_link: `https://res.cloudinary.com/demo/image/upload/v1/progress/${id}.jpg` })
// newest first, as the API sends them
const OCT = photo("oct", "2026-10-20T12:00:00Z")
const OCT2 = photo("oct2", "2026-10-06T12:00:00Z")
const MAR = photo("mar", "2026-03-02T12:00:00Z")

type Route = (init?: RequestInit) => Response | Promise<Response>
let routes: Record<string, Route>
let fetch: ReturnType<typeof vi.fn>
function stubApi(images: ProgressPhoto[] | null = [OCT, OCT2, MAR], blurPhotos = false) {
    routes = {
        "/api/user/userImages/getUserImages": () => images ? json({ images, blurPhotos }) : json({ message: "nope" }, 500),
        "/api/user/settings": () => json({}),
        "/api/user/userImages/uploadUserImages": () => json({ photo: photo("new", "2026-10-28T12:00:00Z") }),
        "/api/user/userImages/deleteUserImages": () => json({}),
    }
    fetch = vi.fn(async (url: string, init?: RequestInit) => routes[url](init))
    vi.stubGlobal("fetch", fetch)
}
const sent = (url: string) => fetch.mock.calls.filter(([u]) => u === url).map(([, init]) => init as RequestInit)
const mount = async () => {
    render(<ProgressPhotosComponent />)
    await waitFor(() => expect(screen.queryByLabelText("Loading photos")).not.toBeInTheDocument())
}
const image = (name = "me.jpg", type = "image/jpeg", size = 1000) => {
    const file = new File(["x"], name, { type })
    Object.defineProperty(file, "size", { value: size })
    return file
}
const fileInput = () => document.querySelector("input[type=file]") as HTMLInputElement

beforeEach(() => {
    search = new URLSearchParams()
    stubIntersectionObserver()
    URL.createObjectURL = vi.fn(() => "blob:preview")
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(console, "error").mockImplementation(() => {})
    stubApi()
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("progress photos", () => {
    it("groups photos by month with counts, newest first", async () => {
        localStorage.setItem("user_photos", "[]")
        await mount()
        expect(localStorage.getItem("user_photos")).toBeNull() // the old shared cache is cleared
        expect(screen.getByText("3 photos · since March 2026")).toBeInTheDocument()
        expect(screen.getByText("October 2026")).toHaveTextContent("2 photos")
        expect(screen.getByText("March 2026")).toHaveTextContent("1 photo")
        expect(screen.getByRole("img", { name: "Progress photo from October 20, 2026" })).toBeInTheDocument()
        expect(screen.getByRole("switch", { name: "Blur progress photos" })).toHaveAttribute("aria-checked", "false")
    })

    it("explains an empty collection", async () => {
        stubApi([])
        await mount()
        expect(screen.getByText("No progress photos yet")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Compare" })).not.toBeInTheDocument()
    })

    it("offers to try again when the photos can't load", async () => {
        stubApi(null)
        await mount()
        expect(screen.getByText("Couldn't load your photos")).toBeInTheDocument()
        routes["/api/user/userImages/getUserImages"] = () => json({ images: [MAR] })
        await user.click(screen.getByRole("button", { name: "Try again" }))
        expect(await screen.findByText("1 photo · since March 2026")).toBeInTheDocument()
    })

    it("shows only blurred versions while blurring is on, and reveals one photo at a time", async () => {
        stubApi(undefined, true)
        await mount()
        expect(screen.queryByRole("img", { name: /^Progress photo/ })).not.toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Open blurred progress photo from October 20, 2026" }))
        const viewer = screen.getByRole("dialog", { name: "Progress photo" })
        expect(within(viewer).getByRole("img", { name: "Blurred progress photo from October 20, 2026" })).toBeInTheDocument()
        await user.click(within(viewer).getByRole("button", { name: "Show photo" }))
        expect(within(viewer).getByRole("img", { name: "Progress photo from October 20, 2026" })).toBeInTheDocument()
        await user.click(within(viewer).getByRole("button", { name: "Blur this photo again" }))
        expect(within(viewer).getByRole("img", { name: /^Blurred/ })).toBeInTheDocument()
    })

    it("saves the blur setting, and stays blurred if turning it off fails", async () => {
        await mount()
        const toggle = screen.getByRole("switch", { name: "Blur progress photos" })
        await user.click(toggle)
        expect(toggle).toHaveAttribute("aria-checked", "true")
        expect(JSON.parse(String(sent("/api/user/settings")[0].body))).toEqual({ blurProgressPhotos: true })

        routes["/api/user/settings"] = () => json({}, 500)
        await user.click(toggle)
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save, try again")
        expect(toggle).toHaveAttribute("aria-checked", "true")
    })

    it("keeps blurring on when turning it on fails to save", async () => {
        await mount()
        routes["/api/user/settings"] = () => { throw new Error("offline") }
        const toggle = screen.getByRole("switch", { name: "Blur progress photos" })
        await user.click(toggle)
        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(toggle).toHaveAttribute("aria-checked", "true")
    })

    it("steps through photos in the viewer with buttons and arrow keys, and closes with Escape", async () => {
        await mount()
        await user.click(screen.getByRole("button", { name: "Open progress photo from October 20, 2026" }))
        const viewer = screen.getByRole("dialog", { name: "Progress photo" })
        expect(viewer).toHaveTextContent("Photo 1 of 3")
        expect(within(viewer).getByRole("button", { name: "Newer photo" })).toBeDisabled()

        await user.click(within(viewer).getByRole("button", { name: "Older photo" }))
        expect(viewer).toHaveTextContent("Photo 2 of 3")
        await user.keyboard("{ArrowRight}")
        expect(viewer).toHaveTextContent("Photo 3 of 3")
        await user.keyboard("{ArrowRight}") // already the oldest
        expect(viewer).toHaveTextContent("Photo 3 of 3")
        await user.keyboard("{ArrowLeft}")
        expect(viewer).toHaveTextContent("Photo 2 of 3")

        await user.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Open progress photo from March 2, 2026" }))
        await user.click(screen.getByRole("button", { name: "Close" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("deletes a photo after confirming, and moves on to the next one", async () => {
        await mount()
        await user.click(screen.getByRole("button", { name: "Open progress photo from October 20, 2026" }))
        await user.click(screen.getByRole("button", { name: "Delete photo" }))
        expect(screen.getByText("Delete this photo?")).toBeInTheDocument()
        await user.keyboard("{ArrowRight}") // arrows do nothing while confirming
        await user.keyboard("{Escape}") // Escape cancels the confirmation first
        expect(screen.queryByText("Delete this photo?")).not.toBeInTheDocument()
        expect(screen.getByRole("dialog")).toHaveTextContent("Photo 1 of 3")

        await user.click(screen.getByRole("button", { name: "Delete photo" }))
        await user.click(screen.getByRole("button", { name: "Cancel" }))
        await user.click(screen.getByRole("button", { name: "Delete photo" }))
        await user.click(screen.getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Photo 1 of 2"))
        expect(JSON.parse(String(sent("/api/user/userImages/deleteUserImages")[0].body))).toEqual({ id: "oct" })
        expect(screen.getByText("2 photos · since March 2026")).toBeInTheDocument()
    })

    it("closes the viewer after deleting the only photo, and keeps a photo the server wouldn't delete", async () => {
        stubApi([MAR])
        await mount()
        routes["/api/user/userImages/deleteUserImages"] = () => json({}, 500)
        await user.click(screen.getByRole("button", { name: "Open progress photo from March 2, 2026" }))
        await user.click(screen.getByRole("button", { name: "Delete photo" }))
        await user.click(screen.getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled())
        expect(screen.getByRole("dialog")).toHaveTextContent("Photo 1 of 1")

        routes["/api/user/userImages/deleteUserImages"] = () => json({})
        await user.click(screen.getByRole("button", { name: "Delete" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(screen.getByText("No progress photos yet")).toBeInTheDocument()
    })

    it("uploads a chosen photo and adds it to the top", async () => {
        await mount()
        await user.click(screen.getByRole("button", { name: "Add photo" }))
        const dialog = screen.getByRole("dialog", { name: "Add progress photo" })
        const click = vi.spyOn(fileInput(), "click")
        await user.click(within(dialog).getByRole("button", { name: /Select a photo to upload/ }))
        expect(click).toHaveBeenCalled()

        await user.upload(fileInput(), image())
        expect(within(dialog).getByRole("img", { name: "Selected photo preview" })).toHaveAttribute("src", "blob:preview")
        await user.click(within(dialog).getByRole("button", { name: "Upload photo" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(sent("/api/user/userImages/uploadUserImages")[0].body).toBeInstanceOf(FormData)
        expect(screen.getByText("4 photos · since March 2026")).toBeInTheDocument()
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview")
    })

    it("reloads the photos when the upload response doesn't include the new one", async () => {
        await mount()
        routes["/api/user/userImages/uploadUserImages"] = () => json({})
        routes["/api/user/userImages/getUserImages"] = () => json({ images: [OCT, MAR] })
        await user.click(screen.getByRole("button", { name: "Add photo" }))
        await user.upload(fileInput(), image())
        await user.click(screen.getByRole("button", { name: "Upload photo" }))
        expect(await screen.findByText("2 photos · since March 2026")).toBeInTheDocument()
    })

    it("hides the upload preview while blurring is on, until asked", async () => {
        stubApi(undefined, true)
        await mount()
        await user.click(screen.getByRole("button", { name: "Add photo" }))
        await user.upload(fileInput(), image())
        await user.click(screen.getByRole("button", { name: "Show preview" }))
        expect(screen.queryByRole("button", { name: "Show preview" })).not.toBeInTheDocument()
        const click = vi.spyOn(fileInput(), "click")
        await user.click(screen.getByRole("button", { name: "Choose another" }))
        expect(click).toHaveBeenCalled()
    })

    it("explains files it won't upload and failed uploads", async () => {
        await mount()
        await user.click(screen.getByRole("button", { name: "Add photo" }))
        const dialog = screen.getByRole("dialog", { name: "Add progress photo" })
        fireEvent.change(fileInput(), { target: { files: [image("notes.pdf", "application/pdf")] } })
        expect(within(dialog).getByRole("alert")).toHaveTextContent("That file isn't an image.")
        fireEvent.change(fileInput(), { target: { files: [image("huge.jpg", "image/jpeg", 11 * 1024 * 1024)] } })
        expect(within(dialog).getByRole("alert")).toHaveTextContent("That photo is over 10 MB.")
        fireEvent.change(fileInput(), { target: { files: [] } })

        await user.upload(fileInput(), image())
        expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
        await user.upload(fileInput(), image("second.jpg")) // replacing the choice frees the old preview
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview")

        routes["/api/user/userImages/uploadUserImages"] = () => json({}, 429)
        await user.click(within(dialog).getByRole("button", { name: "Upload photo" }))
        expect(await within(dialog).findByRole("alert")).toHaveTextContent("You're uploading too quickly.")

        routes["/api/user/userImages/uploadUserImages"] = () => json({ message: "bad image" }, 400)
        await user.click(within(dialog).getByRole("button", { name: "Upload photo" }))
        expect(await within(dialog).findByText("Upload failed. Check your connection and try again.")).toBeInTheDocument()

        routes["/api/user/userImages/uploadUserImages"] = () => new Response("oops", { status: 502 })
        await user.click(within(dialog).getByRole("button", { name: "Upload photo" }))
        await waitFor(() => expect(console.error).toHaveBeenCalledWith("Error uploading image: ", new Error("status 502")))
    })

    it("takes a dropped photo, and closes with Escape or the close button", async () => {
        await mount()
        await user.click(screen.getByRole("button", { name: "Add photo" }))
        const zone = screen.getByRole("button", { name: /Select a photo to upload/ })
        fireEvent.dragOver(zone)
        expect(zone).toHaveTextContent("Drop to add it")
        fireEvent.dragLeave(zone)
        expect(zone).toHaveTextContent("Select a photo to upload")
        fireEvent.drop(zone, { dataTransfer: { files: [image()] } })
        expect(screen.getByRole("img", { name: "Selected photo preview" })).toBeInTheDocument()
        await user.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Add photo" }))
        const click = vi.spyOn(fileInput(), "click")
        screen.getByRole("button", { name: /Select a photo to upload/ }).focus()
        await user.keyboard("{Enter}")
        await user.keyboard("a")
        expect(click).toHaveBeenCalledTimes(1)
        await user.click(screen.getByRole("button", { name: "Close" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("opens the upload form from the upload page's link, and tidies a stray video link", async () => {
        search = new URLSearchParams("photoSubmit=true&videoSubmit=true")
        await mount()
        expect(screen.getByRole("dialog", { name: "Add progress photo" })).toBeInTheDocument()
        expect(replace).toHaveBeenCalledWith(window.location.pathname)
    })

    it("compares two picked photos, or the first and latest", async () => {
        await mount()
        await user.click(screen.getByRole("button", { name: "Compare" }))
        expect(screen.getByRole("status")).toHaveTextContent("0 of 2 selected")
        await user.click(screen.getByRole("button", { name: "Select progress photo from October 6, 2026 to compare" }))
        await user.click(screen.getByRole("button", { name: "Unselect progress photo from October 6, 2026 to compare" }))
        await user.click(screen.getByRole("button", { name: "Select progress photo from October 6, 2026 to compare" }))
        expect(screen.getByRole("status")).toHaveTextContent("1 of 2 selected")
        await user.click(screen.getByRole("button", { name: "Select progress photo from March 2, 2026 to compare" }))
        expect(screen.getByRole("dialog", { name: "Compare progress photos" })).toHaveTextContent("7 months apart")

        await user.click(screen.getByRole("button", { name: "Change photos" }))
        expect(screen.getByRole("status")).toHaveTextContent("0 of 2 selected")
        await user.click(screen.getByRole("button", { name: "First vs latest" }))
        expect(screen.getByRole("dialog", { name: "Compare progress photos" })).toHaveTextContent("October 20, 2026")
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }))
        expect(screen.queryByRole("status")).not.toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Compare" }))
        await user.click(screen.getByRole("button", { name: "Cancel" }))
        expect(screen.getByRole("button", { name: "Add photo" })).toBeInTheDocument()
    })

    it("renders large collections in batches as you scroll", async () => {
        const many = Array.from({ length: 30 }, (_, i) => photo(`p${i}`, `2026-0${1 + (i % 9)}-1${i % 10}T12:00:00Z`))
        stubApi(many)
        await mount()
        expect(screen.getAllByRole("button", { name: /^Open progress photo/ })).toHaveLength(24)
        act(() => FakeIntersectionObserver.show(false))
        expect(screen.getAllByRole("button", { name: /^Open progress photo/ })).toHaveLength(24)
        act(() => FakeIntersectionObserver.show())
        expect(screen.getAllByRole("button", { name: /^Open progress photo/ })).toHaveLength(30)
    })
})
