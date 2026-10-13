// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import ReleaseNotes from "@/app/internal_components/releases/ReleaseNotes"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const release = { id: 7, title: "Change your activity level in Settings", body: "Pick how active you are.\n\n- Targets update **right away**", prNumber: 17, releasedAt: "2026-10-13T12:00:00Z" }

afterEach(() => vi.unstubAllGlobals())

describe("ReleaseNotes", () => {
    it("shows the pull request's title and description, and records it as seen when dismissed", async () => {
        const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? json({ lastSeenReleaseId: 7 }) : json({ release }))
        vi.stubGlobal("fetch", fetch)
        render(<ReleaseNotes />)

        const dialog = await screen.findByRole("dialog", { name: "Change your activity level in Settings" })
        expect(dialog).toHaveTextContent("Pick how active you are.")
        expect(screen.getByText("right away").tagName).toBe("STRONG")

        await userEvent.click(screen.getByRole("button", { name: "Got it" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/releases", expect.objectContaining({ method: "POST", body: JSON.stringify({ seenId: 7 }) })))
    })

    it("also records it as seen when closed with Escape", async () => {
        const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? json({}) : json({ release }))
        vi.stubGlobal("fetch", fetch)
        render(<ReleaseNotes />)
        await screen.findByRole("dialog")

        await userEvent.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    })

    it("shows nothing when there's no unseen release or the request fails", async () => {
        const fetch = vi.fn(async () => json({ release: null }))
        vi.stubGlobal("fetch", fetch)
        const { container } = render(<ReleaseNotes />)
        await waitFor(() => expect(fetch).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()

        vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Unauthorized" }, 401)))
        const { container: other } = render(<ReleaseNotes />)
        await waitFor(() => expect(other).toBeEmptyDOMElement())
    })
})
