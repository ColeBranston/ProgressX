// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"
import FollowList from "@/app/internal_components/follows/FollowList"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const person = (username: string, extra: Record<string, unknown> = {}) => ({ username, name: `${username} name`, pfp: null, privacy: "public", isOwner: false, following: false, ...extra })
type Route = () => Response | Promise<Response>
function stubLists(routes: Record<string, Route>) {
    const fetch = vi.fn(async (url: string) => {
        const route = routes[url]
        if (!route) throw new Error(`unexpected ${url}`)
        return route()
    })
    vi.stubGlobal("fetch", fetch)
    return fetch
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("FollowList", () => {
    it("lists someone's followers, with follow buttons and links to their profiles", async () => {
        stubLists({ "/api/profiles/lift%20daily/followers": () => json({ people: [person("ann"), person("me", { isOwner: true, name: "" })], nextCursor: null }) })
        const onClose = vi.fn()
        render(<FollowList username="lift daily" initial="followers" counts={{ followers: 2, following: 5 }} onClose={onClose} />)

        const dialog = screen.getByRole("dialog", { name: "Followers" })
        expect(within(dialog).getByRole("status", { name: "Loading" })).toBeInTheDocument()
        expect(await within(dialog).findByRole("link", { name: /@ann/ })).toHaveAttribute("href", "/profile/ann")
        expect(within(dialog).getByRole("link", { name: "@me" })).toHaveAttribute("href", "/profile")
        expect(within(dialog).getByText("You")).toBeInTheDocument()
        expect(within(dialog).getByRole("button", { name: "Follow @ann" })).toBeInTheDocument()
        expect(within(dialog).getByRole("tab", { name: "2Followers" })).toHaveAttribute("aria-selected", "true")
        expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus()

        await user.click(within(dialog).getByRole("link", { name: /@ann/ }))
        expect(onClose).toHaveBeenCalled()
    })

    it("switches tabs and says when a list is empty", async () => {
        stubLists({
            "/api/profiles/me/followers": () => json({ people: [], nextCursor: null }),
            "/api/profiles/me/following": () => json({ people: [], nextCursor: null }),
            "/api/profiles/ann/followers": () => json({ people: [], nextCursor: null }),
            "/api/profiles/ann/following": () => json({ people: [], nextCursor: null }),
        })
        const { unmount } = render(<FollowList username="me" initial="followers" onClose={() => {}} />)
        expect(await screen.findByText("No one follows you yet.")).toBeInTheDocument()
        await user.click(screen.getByRole("tab", { name: "Following" }))
        expect(await screen.findByText("You're not following anyone yet. Find people with the search box.")).toBeInTheDocument()
        expect(screen.getByRole("dialog", { name: "Following" })).toBeInTheDocument()
        unmount()

        render(<FollowList username="ann" initial="following" onClose={() => {}} />)
        expect(await screen.findByText("Not following anyone yet.")).toBeInTheDocument()
        await user.click(screen.getByRole("tab", { name: "Followers" }))
        expect(await screen.findByText("No followers yet.")).toBeInTheDocument()
    })

    it("loads more people a page at a time", async () => {
        const fetch = stubLists({
            "/api/profiles/ann/following": () => json({ people: [person("bo")], nextCursor: "c/1" }),
            "/api/profiles/ann/following?cursor=c%2F1": () => json({ people: [person("cy")], nextCursor: null }),
        })
        render(<FollowList username="ann" initial="following" onClose={() => {}} />)
        await screen.findByText("@bo")
        await user.click(screen.getByRole("button", { name: "Load more" }))
        expect(await screen.findByText("@cy")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument()
        expect(fetch).toHaveBeenCalledTimes(2)
    })

    it("keeps the people already shown when the next page fails", async () => {
        stubLists({
            "/api/profiles/ann/following": () => json({ people: [person("bo")], nextCursor: "2" }),
            "/api/profiles/ann/following?cursor=2": () => json({ message: "Slow down" }, 429),
        })
        render(<FollowList username="ann" initial="following" onClose={() => {}} />)
        await screen.findByText("@bo")
        await user.click(screen.getByRole("button", { name: "Load more" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Slow down")
        expect(screen.getByText("@bo")).toBeInTheDocument()
    })

    it("explains a private account's hidden lists and other failures", async () => {
        stubLists({
            "/api/profiles/ann/followers": () => json({}, 403),
            "/api/profiles/ann/following": () => new Response("down", { status: 500 }),
        })
        render(<FollowList username="ann" initial="followers" onClose={() => {}} />)
        expect(await screen.findByText("This account is private. Only the followers it approves can see its lists.")).toBeInTheDocument()
        await user.click(screen.getByRole("tab", { name: "Following" }))
        expect(await screen.findByText("Couldn't load this list")).toBeInTheDocument()
    })

    it("closes with Escape, the close button or the backdrop, and gives focus back", async () => {
        stubLists({ "/api/profiles/ann/followers": () => json({ people: [], nextCursor: null }) })
        const opener = document.createElement("button")
        document.body.append(opener)
        opener.focus()
        const onClose = vi.fn()
        const { unmount } = render(<FollowList username="ann" initial="followers" onClose={onClose} />)
        await screen.findByText("No followers yet.")
        await user.keyboard("{Escape}")
        await user.click(screen.getByRole("button", { name: "Close" }))
        await user.click(screen.getByRole("dialog").parentElement!)
        await user.click(screen.getByRole("dialog")) // inside the dialog: stays open
        expect(onClose).toHaveBeenCalledTimes(3)
        unmount()
        expect(opener).toHaveFocus()
        opener.remove()
    })

    it("tells the page when you follow someone from the list", async () => {
        stubLists({ "/api/profiles/ann/followers": () => json({ people: [person("bo")], nextCursor: null }) })
        const onFollowChange = vi.fn()
        render(<FollowList username="ann" initial="followers" onClose={() => {}} onFollowChange={onFollowChange} />)
        await screen.findByText("@bo")
        vi.stubGlobal("fetch", vi.fn(async () => json({ following: true, followers: 1 })))
        await user.click(screen.getByRole("button", { name: "Follow @bo" }))
        await waitFor(() => expect(onFollowChange).toHaveBeenCalled())
    })
})
