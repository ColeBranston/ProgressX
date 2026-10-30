// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"

const push = vi.fn()
const router = { push }
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => search }))
vi.mock("@/app/internal_components/videos/VideoGrid", () => ({
    default: ({ tab, search, empty }: { tab: string, search: string, empty: React.ReactNode }) => <section aria-label={`${tab} grid for ${search}`}>{empty}</section>,
}))

import SearchResults from "@/app/internal_components/search/SearchResults"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const profile = (username: string, extra: Record<string, unknown> = {}) => ({ username, name: "", pfp: null, privacy: "public", followers: 1, isOwner: false, following: false, ...extra })
let fetch: ReturnType<typeof vi.fn>
function stubFind(routes: Record<string, () => Response>) {
    fetch = vi.fn(async (url: string) => {
        const route = routes[url]
        if (!route) throw new Error(`unexpected ${url}`)
        return route()
    })
    vi.stubGlobal("fetch", fetch)
}
const at = (query: string) => { search = new URLSearchParams(query) }

beforeEach(() => at(""))
afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("search results", () => {
    it("asks for words before there are any", async () => {
        render(<SearchResults />)
        expect(screen.getByText("Search for videos by caption or creator, or find people by name or username.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Search" })).toBeDisabled()
        await user.type(screen.getByRole("searchbox"), "  bench  {Enter}")
        expect(push).toHaveBeenCalledWith("/search?q=bench&tab=videos")
    })

    it("shows matching videos under the Videos tab, and switches to Profiles", async () => {
        at("q=squat")
        render(<SearchResults />)
        expect(screen.getByRole("heading", { name: "Results for “squat”" })).toBeInTheDocument()
        expect(screen.getByRole("tab", { name: "Videos" })).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("region", { name: "search grid for squat" })).toHaveTextContent("No videos match “squat”.")
        expect(screen.getByRole("searchbox")).toHaveValue("squat")
        await user.click(screen.getByRole("tab", { name: "Profiles" }))
        expect(push).toHaveBeenCalledWith("/search?q=squat&tab=profiles")
    })

    it("lists matching people with follower counts, follow buttons and private badges", async () => {
        at("q=lee&tab=profiles")
        stubFind({ "/api/find?q=lee&type=profiles": () => json({
            profiles: [profile("lee", { name: "Lee", followers: 1 }), profile("leo", { followers: 1500, privacy: "private" }), profile("me", { isOwner: true })],
            nextCursor: null,
        }) })
        render(<SearchResults />)
        expect(screen.getByRole("status", { name: "Searching" })).toBeInTheDocument()
        const lee = (await screen.findByRole("link", { name: /@lee/ }))
        expect(lee).toHaveAttribute("href", "/profile/lee")
        expect(lee).toHaveTextContent("Lee1 follower")
        expect(screen.getByRole("link", { name: /@leo/ })).toHaveTextContent("1.5K followersPrivate")
        expect(screen.getByRole("link", { name: /@meYou/ })).toHaveAttribute("href", "/profile")
        expect(screen.getAllByRole("button", { name: /^Follow/ })).toHaveLength(2)

        vi.stubGlobal("fetch", vi.fn(async () => json({ following: true, followers: 2 })))
        await user.click(screen.getByRole("button", { name: "Follow @lee" }))
        await waitFor(() => expect(screen.getByRole("link", { name: /@lee/ })).toHaveTextContent("2 followers"))
        expect(screen.getByRole("link", { name: /@leo/ })).toHaveTextContent("1.5K followers")
    })

    it("loads more people, and keeps them when the next page fails", async () => {
        at("q=a&tab=profiles")
        stubFind({
            "/api/find?q=a&type=profiles": () => json({ profiles: [profile("ann")], nextCursor: "c1" }),
            "/api/find?q=a&type=profiles&cursor=c1": () => json({ profiles: [profile("bo")], nextCursor: "c2" }),
            "/api/find?q=a&type=profiles&cursor=c2": () => json({ message: "Slow down" }, 429),
        })
        render(<SearchResults />)
        await user.click(await screen.findByRole("button", { name: "Load more" }))
        expect(await screen.findByRole("link", { name: /@bo/ })).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Load more" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Slow down")
        expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(2)
    })

    it("says when no one matches, or the search fails", async () => {
        at("q=zz&tab=profiles")
        stubFind({ "/api/find?q=zz&type=profiles": () => json({ profiles: [], nextCursor: null }) })
        const { unmount } = render(<SearchResults />)
        expect(await screen.findByText("No one matches “zz”.")).toBeInTheDocument()
        unmount()

        stubFind({ "/api/find?q=zz&type=profiles": () => new Response("", { status: 503 }) })
        render(<SearchResults />)
        expect(await screen.findByText("Couldn't search right now")).toBeInTheDocument()
    })
})
