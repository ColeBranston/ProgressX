// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import FollowList from "@/app/internal_components/follows/FollowList"
import { ViewerProvider } from "@/app/contexts/viewer"

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

afterEach(() => vi.unstubAllGlobals())

describe("your follow requests", () => {
    it("lists who is waiting, and accepting or declining takes them off the list", async () => {
        const calls: string[] = []
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
            calls.push(`${init?.method ?? "GET"} ${url}`)
            if (url === "/api/user/follow-requests") {
                return json({ requests: [{ username: "sam_lifts", name: "Sam", pfp: null }, { username: "jo.runs", name: "Jo", pfp: null }] })
            }
            return json({ followers: 1 })
        }))
        const onFollowChange = vi.fn()
        render(<ViewerProvider signedIn><FollowList username="me" initial="requests" counts={{ followers: 0, following: 0, requests: 2 }} onClose={() => {}} onFollowChange={onFollowChange} /></ViewerProvider>)

        expect(screen.getByRole("tab", { name: /Requests/ })).toHaveTextContent("2Requests")
        const sam = (await screen.findByText("@sam_lifts")).closest("li")!
        await userEvent.click(within(sam).getByRole("button", { name: "Accept" }))
        await waitFor(() => expect(screen.queryByText("@sam_lifts")).toBeNull())
        expect(calls).toContain("PUT /api/user/follow-requests/sam_lifts")
        expect(onFollowChange).toHaveBeenCalled()

        await userEvent.click(within(screen.getByText("@jo.runs").closest("li")!).getByRole("button", { name: "Decline" }))
        await waitFor(() => expect(screen.getByText(/No follow requests/)).toBeInTheDocument())
        expect(calls).toContain("DELETE /api/user/follow-requests/jo.runs")
        expect(screen.getByRole("tab", { name: /Requests/ })).toHaveTextContent("0Requests")
    })

    it("only has a Requests tab on your own lists", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => json({ people: [], nextCursor: null })))
        render(<ViewerProvider signedIn><FollowList username="sam_lifts" initial="followers" onClose={() => {}} /></ViewerProvider>)
        expect((await screen.findAllByRole("tab")).map((t) => t.textContent)).toEqual(["Followers", "Following"])
    })
})
