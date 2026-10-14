// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ReleaseNotes from "@/app/internal_components/releases/ReleaseNotes"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const release = { id: 7, title: "Change your activity level in Settings", body: "Pick how active you are.\n\n- Targets update **right away**", prNumber: 17, releasedAt: "2026-10-13T12:00:00Z" }

// GET answers with `latest`; POST (marking it seen) answers with `seenStatus`
function stubApi(latest: unknown, seenStatus = 200) {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? json({ ok: seenStatus === 200 }, seenStatus) : json({ release: latest }))
    vi.stubGlobal("fetch", fetch)
    return fetch
}
const posts = (fetch: ReturnType<typeof stubApi>) => fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)))

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe("ReleaseNotes", () => {
    it("shows the pull request's title and description, and records it as seen when dismissed", async () => {
        const fetch = stubApi(release)
        render(<ReleaseNotes />)

        const dialog = await screen.findByRole("dialog", { name: "Change your activity level in Settings" })
        expect(dialog).toHaveTextContent("Pick how active you are.")
        expect(screen.getByRole("listitem")).toHaveTextContent("Targets update right away")

        await userEvent.click(screen.getByRole("button", { name: "Got it" }))
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        await waitFor(() => expect(posts(fetch)).toEqual([{ seenId: 7 }]))
        expect(localStorage.getItem("releaseSeenPending")).toBeNull()
    })

    it("also records it as seen when closed with Escape", async () => {
        const fetch = stubApi(release)
        render(<ReleaseNotes />)
        await screen.findByRole("dialog")

        await userEvent.keyboard("{Escape}")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        await waitFor(() => expect(posts(fetch)).toEqual([{ seenId: 7 }]))
    })

    it("keeps a dismissal that couldn't be saved and saves it on the next visit instead of asking again", async () => {
        stubApi(release, 500)
        const { unmount } = render(<ReleaseNotes />)
        await userEvent.click(await screen.findByRole("button", { name: "Got it" }))
        await waitFor(() => expect(localStorage.getItem("releaseSeenPending")).toBe("7"))
        unmount()

        const fetch = stubApi(release)
        render(<ReleaseNotes />)
        await waitFor(() => expect(posts(fetch)).toEqual([{ seenId: 7 }]))
        await waitFor(() => expect(localStorage.getItem("releaseSeenPending")).toBeNull())
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("shows a newer release even if an older dismissal is still waiting to be saved", async () => {
        localStorage.setItem("releaseSeenPending", "6")
        stubApi(release)
        render(<ReleaseNotes />)
        expect(await screen.findByRole("dialog", { name: release.title })).toBeInTheDocument()
    })

    it("shows nothing when there's no unseen release", async () => {
        const fetch = stubApi(null)
        render(<ReleaseNotes />)
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
        await fetch.mock.results[0].value // the request has finished
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("shows nothing when the request fails", async () => {
        const fetch = vi.fn(async () => json({ message: "Unauthorized" }, 401))
        vi.stubGlobal("fetch", fetch)
        render(<ReleaseNotes />)
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
        await fetch.mock.results[0].value
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
})
