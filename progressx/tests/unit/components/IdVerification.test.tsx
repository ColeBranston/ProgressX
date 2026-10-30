// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"
import IdVerification from "@/app/internal_components/verification/IdVerification"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

type Status = { state: string, documentType: string | null, issuingCountry: string | null, expiresOn: string | null, verifiedAt: string | null, reason: string | null }
const none: Status = { state: "none", documentType: null, issuingCountry: null, expiresOn: null, verifiedAt: null, reason: null }
const verified: Status = { state: "verified", documentType: "passport", issuingCountry: "CAN", expiresOn: "2031-05-01T12:00:00Z", verifiedAt: "2026-10-01T12:00:00Z", reason: null }

// the check streams one JSON line per step, then the result
const stream = (...events: object[]) => {
    const text = events.map((e) => JSON.stringify(e)).join("\n") + "\n"
    const bytes = new TextEncoder().encode(text)
    const half = Math.floor(bytes.length / 2)
    return new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, half)); c.enqueue(bytes.slice(half)); c.close() } }), { status: 200 })
}

type Route = (init?: RequestInit) => Response | Promise<Response>
let status: Status
let verifyRoute: Route
let fetch: ReturnType<typeof vi.fn>
const sent = (method: string) => fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method).map(([, init]) => init as RequestInit)
const photo = (type = "image/jpeg", size = 1000) => {
    const file = new File(["x"], "id.jpg", { type })
    Object.defineProperty(file, "size", { value: size })
    return file
}
const inputs = () => [...document.querySelectorAll("input[type=file]")] as HTMLInputElement[]
const dialog = () => screen.getByRole("dialog", { name: "Verify your ID" })

beforeEach(() => {
    status = none
    verifyRoute = () => stream({ type: "status", text: "Reading the code" }, { type: "result", ok: true })
    fetch = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") return verifyRoute(init)
        if (init?.method === "DELETE") return json({})
        return json({ status, available: true })
    })
    vi.stubGlobal("fetch", fetch)
    URL.createObjectURL = vi.fn(() => "blob:id")
    URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

describe("identity verification in settings", () => {
    it("explains why to verify, and offers to", async () => {
        render(<IdVerification />)
        expect(screen.getByText("Loading…")).toBeInTheDocument()
        expect(await screen.findByText(/Verify with a passport, or a driver's licence/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Verify ID" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument()
    })

    it("hides the buttons where verification isn't set up", async () => {
        fetch.mockImplementation(async () => json({ status: none, available: false }))
        render(<IdVerification />)
        expect(await screen.findByText("ID verification isn't available yet.")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Verify ID" })).not.toBeInTheDocument()
    })

    it("says when the status can't load", async () => {
        fetch.mockImplementation(async () => json({}, 500))
        render(<IdVerification />)
        expect(await screen.findByText("Couldn't load your verification.")).toBeInTheDocument()
    })

    it("shows a verified passport, and removes it after confirming", async () => {
        status = verified
        render(<IdVerification />)
        expect(await screen.findByText("✓ Verified")).toBeInTheDocument()
        expect(screen.getByText("Verified with your passport (CAN) on Oct 1, 2026. Valid until May 1, 2031.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Remove" }))
        expect(screen.getByText(/This permanently deletes your stored ID photos/)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Cancel" }))
        expect(screen.queryByRole("button", { name: "Remove my ID" })).not.toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Remove" }))
        status = none
        await user.click(screen.getByRole("button", { name: "Remove my ID" }))
        expect(await screen.findByRole("status")).toHaveTextContent("Your ID has been removed.")
        expect(sent("DELETE")).toHaveLength(1)
        expect(await screen.findByRole("button", { name: "Verify ID" })).toBeInTheDocument()
    })

    it("explains a failed removal", async () => {
        status = verified
        render(<IdVerification />)
        await user.click(await screen.findByRole("button", { name: "Remove" }))
        fetch.mockImplementationOnce(async () => json({ message: "Try again later" }, 500))
        await user.click(screen.getByRole("button", { name: "Remove my ID" }))
        expect(await screen.findByRole("status")).toHaveTextContent("Try again later")
        fetch.mockImplementationOnce(async () => new Response("", { status: 500 }))
        await user.click(screen.getByRole("button", { name: "Remove my ID" }))
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Couldn't remove your ID"))
    })

    it("describes an expired or rejected document", async () => {
        status = { ...verified, state: "expired", documentType: "drivers_licence", expiresOn: "2026-09-01T12:00:00Z" }
        const { unmount } = render(<IdVerification />)
        expect(await screen.findByText("Expired")).toBeInTheDocument()
        expect(screen.getByText(/Your driver's licence expired on Sep 1, 2026/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument()
        unmount()

        status = { ...none, state: "rejected", reason: "The photo was blurry" }
        const second = render(<IdVerification />)
        expect(await screen.findByText("Your last try didn't pass: The photo was blurry")).toBeInTheDocument()
        second.unmount()

        status = { ...verified, state: "rejected", documentType: null, issuingCountry: null }
        render(<IdVerification />)
        expect(await screen.findByText("Your last try didn't pass: the document couldn't be checked.")).toBeInTheDocument()
    })

    it("names the document without a country", async () => {
        status = { ...verified, documentType: "id_card", issuingCountry: null }
        render(<IdVerification />)
        expect(await screen.findByText(/^Verified with your ID card on/)).toBeInTheDocument()
    })
})

describe("the verify dialog", () => {
    const openDialog = async () => {
        render(<IdVerification />)
        await user.click(await screen.findByRole("button", { name: "Verify ID" }))
        return dialog()
    }
    const agree = () => user.click(within(dialog()).getByRole("checkbox"))

    it("checks a passport, showing each step, then says you're verified", async () => {
        let finish: (res: Response) => void = () => {}
        verifyRoute = () => new Promise<Response>((resolve) => { finish = resolve })
        await openDialog()
        const verify = within(dialog()).getByRole("button", { name: "Verify" })
        expect(verify).toBeDisabled()
        const click = vi.spyOn(inputs()[0], "click")
        await user.click(within(dialog()).getByRole("button", { name: /Photo page/ }))
        expect(click).toHaveBeenCalled()
        await user.upload(inputs()[0], photo())
        expect(within(dialog()).getByRole("button", { name: "Change photo page" })).toBeInTheDocument()
        expect(verify).toBeDisabled() // not agreed yet
        await agree()
        await user.click(verify)

        expect(await within(dialog()).findByRole("status")).toHaveTextContent("Uploading securely… (this can take a minute)")
        expect(within(dialog()).getByRole("button", { name: "Close" })).toBeDisabled()
        await user.keyboard("{Escape}") // busy: stays open
        await user.click(dialog().parentElement!)
        expect(dialog()).toBeInTheDocument()

        status = verified
        finish(stream({ type: "status", text: "Reading the code" }, { type: "result", ok: true }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(screen.getByRole("status")).toHaveTextContent("You're verified.")
        expect(await screen.findByText("✓ Verified")).toBeInTheDocument()

        const form = sent("POST")[0].body as FormData
        expect(form.get("kind")).toBe("passport")
        expect(form.get("consent")).toBe("yes")
        expect(form.get("back")).toBeNull()
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:id")
    })

    it("needs both sides of a card, and shrinks big photos before sending them", async () => {
        const close = vi.fn()
        vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close })))
        const drawImage = vi.fn()
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage }) as unknown as RenderingContext)
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["small"], { type: "image/jpeg" })))
        await openDialog()
        await user.click(within(dialog()).getByRole("radio", { name: "Driver's licence or ID card" }))
        await user.upload(inputs()[0], photo())
        await agree()
        expect(within(dialog()).getByRole("button", { name: "Verify" })).toBeDisabled()
        const click = vi.spyOn(inputs()[1], "click")
        await user.click(within(dialog()).getByRole("button", { name: /^Back/ }))
        expect(click).toHaveBeenCalled()
        await user.upload(inputs()[1], photo())
        await user.upload(inputs()[1], photo()) // replacing a side frees the old preview
        await user.upload(inputs()[0], photo())
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
        await user.click(within(dialog()).getByRole("button", { name: "Verify" }))

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        const form = sent("POST")[0].body as FormData
        expect(form.get("kind")).toBe("card")
        expect(form.get("back")).toBeInstanceOf(Blob)
        expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1500)
        expect(close).toHaveBeenCalled()
    })

    it("sends the original photo when it can't be shrunk", async () => {
        vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })))
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null)
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(null))
        await openDialog()
        await user.upload(inputs()[0], photo())
        await agree()
        await user.click(within(dialog()).getByRole("button", { name: "Verify" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect((sent("POST")[0].body as FormData).get("front")).toBeInstanceOf(File)
    })

    it("turns away files that aren't photos or are too big", async () => {
        await openDialog()
        fireEvent.change(inputs()[0], { target: { files: [photo("application/pdf")] } })
        expect(within(dialog()).getByRole("alert")).toHaveTextContent("Choose a photo (JPG, PNG, WebP or HEIC).")
        fireEvent.change(inputs()[0], { target: { files: [photo("image/png", 26 * 1024 * 1024)] } })
        expect(within(dialog()).getByRole("alert")).toHaveTextContent("That photo is over 25 MB.")
        fireEvent.change(inputs()[0], { target: { files: [] } })
        await user.upload(inputs()[0], photo())
        expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument()
    })

    it.each([
        ["a rejected document", () => stream({ type: "result", ok: false, reason: "That passport has expired" }), "That passport has expired"],
        ["a rejection with no reason", () => stream({ type: "result", ok: false }), "Your document didn't pass the check"],
        ["a check that never finished", () => stream({ type: "status", text: "Reading" }), "The check didn't finish. Try again."],
        ["a refused upload", () => json({ message: "Too many tries today" }, 429), "Too many tries today"],
        ["a server error", () => new Response("", { status: 500 }), "Couldn't check your document"],
    ])("explains %s and lets them try again", async (_case, answer, message) => {
        verifyRoute = answer
        await openDialog()
        await user.upload(inputs()[0], photo())
        await agree()
        await user.click(within(dialog()).getByRole("button", { name: "Verify" }))
        expect(await within(dialog()).findByRole("alert")).toHaveTextContent(message)
        expect(within(dialog()).getByRole("button", { name: "Verify" })).toBeEnabled()
    })

    it("closes with Cancel, the close button, Escape or the backdrop", async () => {
        await openDialog()
        await user.click(within(dialog()).getByRole("button", { name: "Cancel" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Verify ID" }))
        await user.click(within(dialog()).getByRole("button", { name: "Close" }))
        await user.click(screen.getByRole("button", { name: "Verify ID" }))
        await user.keyboard("{Escape}")
        await user.click(screen.getByRole("button", { name: "Verify ID" }))
        await user.click(dialog().parentElement!)
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
})
