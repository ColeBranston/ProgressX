// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"
import VideoUploadForm from "@/app/internal_components/videos/VideoUploadForm"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

// jsdom can't decode video: the length the browser "reads" from the next chosen file, or an error
let fileDuration: number | "error" | "never" = 30
// what the preview reports when the poster frame is captured (0 wide: this browser can't decode it)
let frame = { width: 0, height: 0 }
const videoProps = ["src", "duration", "videoWidth", "videoHeight", "readyState", "currentTime"] as const
function fakeVideoDecoding() {
    const proto = HTMLVideoElement.prototype as unknown as Record<string, unknown>
    let currentTime = 0
    Object.defineProperties(HTMLVideoElement.prototype, {
        src: {
            configurable: true,
            get() { return this.getAttribute("src") ?? "" },
            set(this: HTMLVideoElement, url: string) {
                this.setAttribute("src", url)
                if (fileDuration === "never") return
                const outcome = fileDuration
                queueMicrotask(() => outcome === "error" ? this.onerror?.(new Event("error")) : this.onloadedmetadata?.(new Event("loadedmetadata")))
            },
        },
        duration: { configurable: true, get: () => typeof fileDuration === "number" ? fileDuration : NaN },
        videoWidth: { configurable: true, get: () => frame.width },
        videoHeight: { configurable: true, get: () => frame.height },
        readyState: { configurable: true, get: () => 1 },
        currentTime: {
            configurable: true,
            get: () => currentTime,
            set(this: HTMLVideoElement, t: number) { currentTime = t; queueMicrotask(() => this.dispatchEvent(new Event("seeked"))) },
        },
    })
    HTMLMediaElement.prototype.load = vi.fn()
    return () => { for (const prop of videoProps) delete proto[prop] }
}

// the upload to R2 goes through XMLHttpRequest; tests decide how each one ends
class FakeXhr {
    static last: FakeXhr
    upload: { onprogress?: (e: ProgressEvent) => void } = {}
    onload?: () => void
    onerror?: () => void
    onabort?: () => void
    status = 0
    method = ""
    url = ""
    headers: Record<string, string> = {}
    body: unknown
    constructor() { FakeXhr.last = this }
    open(method: string, url: string) { this.method = method; this.url = url }
    setRequestHeader(name: string, value: string) { this.headers[name] = value }
    send(body: unknown) { this.body = body }
    abort = vi.fn(() => this.onabort?.())
    progress(loaded: number, total: number, lengthComputable = true) { act(() => this.upload.onprogress?.({ loaded, total, lengthComputable } as ProgressEvent)) }
    finish(status: number) { this.status = status; act(() => this.onload?.()) }
}

type Route = (init?: RequestInit) => Response | Promise<Response>
let routes: Record<string, Route>
let fetch: ReturnType<typeof vi.fn>
const sent = (url: string) => fetch.mock.calls.filter(([u]) => u === url).map(([, init]) => init as RequestInit)
const clip = (name = "squat.mp4", type = "video/mp4", size = 5_000_000) => {
    const file = new File(["x"], name, { type })
    Object.defineProperty(file, "size", { value: size })
    return file
}
const fileInput = () => document.querySelector("input[type=file]") as HTMLInputElement
const dialog = () => screen.getByRole("dialog")
let restoreVideo: () => void

async function chooseAndPost(caption = "") {
    await user.upload(fileInput(), clip())
    const box = await screen.findByRole("textbox", { name: "Caption" })
    if (caption) await user.type(box, caption)
    await user.click(screen.getByRole("button", { name: "Upload video" }))
    await waitFor(() => expect(FakeXhr.last?.url).toBe("https://r2.example/put"))
}

beforeEach(() => {
    fileDuration = 30
    frame = { width: 0, height: 0 }
    restoreVideo = fakeVideoDecoding()
    URL.createObjectURL = vi.fn(() => "blob:clip")
    URL.revokeObjectURL = vi.fn()
    FakeXhr.last = undefined as unknown as FakeXhr
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    vi.stubGlobal("confirm", vi.fn(() => true))
    routes = {
        "/api/videos/upload": () => json({ video: { id: "v1" }, uploadURL: "https://r2.example/put", contentType: "video/mp4" }),
        "/api/videos/v1/complete": () => json({ video: { id: "v1" } }),
        "/api/videos/v1": () => json({}),
    }
    fetch = vi.fn(async (url: string, init?: RequestInit) => routes[url](init))
    vi.stubGlobal("fetch", fetch)
})
afterEach(() => {
    restoreVideo()
    vi.unstubAllGlobals()
})

describe("VideoUploadForm", () => {
    it("uploads a chosen video with its caption, showing progress, then says it's posted", async () => {
        const onUploaded = vi.fn(), onClose = vi.fn()
        render(<VideoUploadForm onClose={onClose} onUploaded={onUploaded} />)
        const click = vi.spyOn(fileInput(), "click")
        await user.click(screen.getByRole("button", { name: /Select a video to upload/ }))
        expect(click).toHaveBeenCalled()

        await chooseAndPost("Leg day")
        expect(JSON.parse(String(sent("/api/videos/upload")[0].body))).toEqual({ caption: "Leg day", sizeBytes: 5_000_000, type: "video/mp4", durationSeconds: 30 })
        expect(FakeXhr.last.method).toBe("PUT")
        expect(FakeXhr.last.headers).toEqual({ "Content-Type": "video/mp4" })
        expect(screen.getByRole("status")).toHaveTextContent("Uploading… 0%")
        FakeXhr.last.progress(1, 4)
        expect(screen.getByRole("status")).toHaveTextContent("Uploading… 25%")
        FakeXhr.last.progress(2, 0, false) // no total known: stays put
        expect(screen.getByRole("status")).toHaveTextContent("Uploading… 25%")
        FakeXhr.last.finish(200)

        expect(await screen.findByText("Video posted")).toBeInTheDocument()
        expect(JSON.parse(String(sent("/api/videos/v1/complete")[0].body))).toEqual({}) // no poster from this browser
        expect(onUploaded).toHaveBeenCalled()
        await user.click(screen.getByRole("button", { name: "Done" }))
        expect(onClose).toHaveBeenCalled()
    })

    it("sends a small poster frame from about a second in", async () => {
        frame = { width: 1440, height: 2560 }
        const drawImage = vi.fn()
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage }) as unknown as RenderingContext)
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAA")
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        await chooseAndPost()
        FakeXhr.last.finish(204)
        await screen.findByText("Video posted")
        expect(JSON.parse(String(sent("/api/videos/v1/complete")[0].body))).toEqual({ poster: "data:image/jpeg;base64,AAA", width: 1440, height: 2560 })
        expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 0, 0, 405, 720)
    })

    it("posts without a poster when grabbing the frame fails", async () => {
        frame = { width: 720, height: 1280 }
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => { throw new Error("tainted") })
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        await chooseAndPost()
        FakeXhr.last.finish(200)
        await screen.findByText("Video posted")
        expect(JSON.parse(String(sent("/api/videos/v1/complete")[0].body))).toEqual({})
    })

    it("turns away files it can't post", async () => {
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        const alert = () => within(dialog()).getByRole("alert")
        fireEvent.change(fileInput(), { target: { files: [clip("notes.pdf", "application/pdf")] } })
        expect(alert()).toHaveTextContent("Choose an MP4 or MOV video")
        fireEvent.change(fileInput(), { target: { files: [clip("clip.avi", "")] } })
        expect(alert()).toHaveTextContent("Choose an MP4 or MOV video")
        fireEvent.change(fileInput(), { target: { files: [clip("big.mp4", "video/mp4", 201 * 1024 * 1024)] } })
        expect(alert()).toHaveTextContent("Videos must be 200 MB or smaller")
        fireEvent.change(fileInput(), { target: { files: [clip("empty.mp4", "video/mp4", 0)] } })
        expect(alert()).toHaveTextContent("That file is empty")
        fileDuration = 200
        fireEvent.change(fileInput(), { target: { files: [clip()] } })
        await waitFor(() => expect(alert()).toHaveTextContent("Videos can be up to 3 minutes long"))
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip")
        fireEvent.change(fileInput(), { target: { files: [] } })
        expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument()
    })

    it("works out the type from the extension, and leaves the length to the server when it can't be read", async () => {
        fileDuration = "error"
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        await user.upload(fileInput(), clip("lift.MOV", "application/octet-stream"))
        await user.click(await screen.findByRole("button", { name: "Upload video" }))
        await waitFor(() => expect(sent("/api/videos/upload")).toHaveLength(1))
        expect(JSON.parse(String(sent("/api/videos/upload")[0].body))).toMatchObject({ type: "video/quicktime", durationSeconds: null })
    })

    it("gives up reading the length after 8 seconds", async () => {
        fileDuration = "never"
        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
            render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
            fireEvent.change(fileInput(), { target: { files: [clip("a.m4v", "")] } })
            await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
            expect(screen.getByRole("textbox", { name: "Caption" })).toBeInTheDocument()
        } finally {
            vi.useRealTimers()
        }
    })

    it("counts the caption and lets you pick a different video", async () => {
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        await user.upload(fileInput(), clip())
        await user.type(await screen.findByRole("textbox", { name: "Caption" }), "abc")
        expect(dialog()).toHaveTextContent("3/300")
        await user.click(screen.getByRole("button", { name: "Choose another" }))
        expect(screen.getByRole("button", { name: /Select a video to upload/ })).toBeInTheDocument()
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip")
    })

    it("takes a dropped video, and only while picking", async () => {
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        const zone = screen.getByRole("button", { name: /Select a video to upload/ })
        fireEvent.dragOver(zone)
        expect(zone).toHaveTextContent("Drop to add it")
        fireEvent.dragLeave(zone)
        expect(zone).toHaveTextContent("Select a video to upload")
        fireEvent.drop(zone, { dataTransfer: { files: [clip()] } })
        expect(await screen.findByRole("textbox", { name: "Caption" })).toBeInTheDocument()
    })

    it("opens the file picker from the keyboard", async () => {
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        const click = vi.spyOn(fileInput(), "click")
        screen.getByRole("button", { name: /Select a video to upload/ }).focus()
        await user.keyboard("{Enter}")
        await user.keyboard(" ")
        await user.keyboard("a")
        expect(click).toHaveBeenCalledTimes(2)
    })

    it("explains a refused upload", async () => {
        routes["/api/videos/upload"] = () => json({ message: "Verify your ID to post videos" }, 403)
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        await user.upload(fileInput(), clip())
        await user.click(await screen.findByRole("button", { name: "Upload video" }))
        expect(await within(dialog()).findByRole("alert")).toHaveTextContent("Verify your ID to post videos")
        expect(screen.getByRole("button", { name: /Select a video to upload/ })).toBeInTheDocument()

        routes["/api/videos/upload"] = () => new Response("", { status: 500 })
        await user.upload(fileInput(), clip())
        await user.click(await screen.findByRole("button", { name: "Upload video" }))
        await waitFor(() => expect(within(dialog()).getByRole("alert")).toHaveTextContent("Couldn't start the upload"))
    })

    it.each([
        [413, "Videos must be 200 MB or smaller"],
        [500, "The upload failed. Check your connection and try again."],
    ])("removes the half-made video when R2 answers %i", async (status, message) => {
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        await chooseAndPost()
        FakeXhr.last.finish(status)
        expect(await within(dialog()).findByRole("alert")).toHaveTextContent(message)
        expect(sent("/api/videos/v1")).toEqual([{ method: "DELETE" }])
    })

    it("explains a dropped connection and a video the server won't post", async () => {
        render(<VideoUploadForm onClose={() => {}} onUploaded={() => {}} />)
        await chooseAndPost()
        act(() => FakeXhr.last.onerror?.())
        expect(await within(dialog()).findByRole("alert")).toHaveTextContent("The upload failed. Check your connection and try again.")

        routes["/api/videos/v1/complete"] = () => json({ message: "That isn't a real MP4" }, 422)
        await chooseAndPost()
        FakeXhr.last.finish(200)
        expect(await within(dialog()).findByRole("alert")).toHaveTextContent("That isn't a real MP4")
        routes["/api/videos/v1/complete"] = () => new Response("", { status: 500 })
        await chooseAndPost()
        FakeXhr.last.finish(200)
        await waitFor(() => expect(within(dialog()).getByRole("alert")).toHaveTextContent("Couldn't post the video"))
        expect(sent("/api/videos/v1")).toHaveLength(3)
    })

    it("asks before cancelling an upload in progress, then cleans it up", async () => {
        const onClose = vi.fn()
        render(<VideoUploadForm onClose={onClose} onUploaded={() => {}} />)
        await chooseAndPost()
        vi.mocked(confirm).mockReturnValueOnce(false)
        await user.keyboard("{Escape}")
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByRole("status")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Close" }))
        expect(confirm).toHaveBeenCalledWith("Cancel this upload?")
        expect(FakeXhr.last.abort).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
        await waitFor(() => expect(sent("/api/videos/v1")).toEqual([{ method: "DELETE" }, { method: "DELETE" }]))
    })

    it("closes straight away before anything is uploading, including from the backdrop", async () => {
        const onClose = vi.fn()
        const { unmount } = render(<VideoUploadForm onClose={onClose} onUploaded={() => {}} />)
        await user.click(dialog().parentElement!)
        await user.keyboard("{Escape}")
        expect(onClose).toHaveBeenCalledTimes(2)
        expect(confirm).not.toHaveBeenCalled()
        unmount()
    })

    it("stops quietly when closed while the server checks the video", async () => {
        let finishCheck: (res: Response) => void = () => {}
        routes["/api/videos/v1/complete"] = () => new Promise<Response>((resolve) => { finishCheck = resolve })
        const onUploaded = vi.fn()
        const { unmount } = render(<VideoUploadForm onClose={() => {}} onUploaded={onUploaded} />)
        await chooseAndPost()
        FakeXhr.last.finish(200)
        expect(await screen.findByText("Checking video…")).toBeInTheDocument()
        unmount()
        await act(async () => finishCheck(json({ video: { id: "v1" } })))
        expect(onUploaded).not.toHaveBeenCalled()
    })
})
