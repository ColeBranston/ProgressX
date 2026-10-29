// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import FollowButton from "@/app/internal_components/follows/FollowButton"

const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))

afterEach(() => vi.unstubAllGlobals())

describe("FollowButton", () => {
    it("follows with PUT and reports the new follower count", async () => {
        const fetch = respond(200, { following: true, followers: 11 })
        vi.stubGlobal("fetch", fetch)
        const onChange = vi.fn()
        render(<FollowButton username="lift_daily" following={false} onChange={onChange} />)

        await userEvent.click(screen.getByRole("button", { name: "Follow @lift_daily" }))
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(true, 11, false))
        expect(fetch).toHaveBeenCalledWith("/api/profiles/lift_daily/follow", { method: "PUT" })
        expect(screen.getByRole("button", { name: "Unfollow @lift_daily" })).toHaveAttribute("aria-pressed", "true")
    })

    it("shows Requested when the profile is private, and cancelling takes the request back", async () => {
        const fetch = respond(200, { following: false, requested: true, followers: 3 })
        vi.stubGlobal("fetch", fetch)
        const onChange = vi.fn()
        render(<FollowButton username="quiet_one" following={false} onChange={onChange} />)
        await userEvent.click(screen.getByRole("button", { name: "Follow @quiet_one" }))
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(false, 3, true))
        const requested = screen.getByRole("button", { name: "Cancel follow request to @quiet_one" })
        expect(requested).toHaveTextContent("Requested")

        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ following: false, requested: false, followers: 3 }), { status: 200 }))
        await userEvent.click(requested)
        await waitFor(() => expect(screen.getByRole("button", { name: "Follow @quiet_one" })).toBeEnabled())
        expect(fetch).toHaveBeenLastCalledWith("/api/profiles/quiet_one/follow", { method: "DELETE" })
    })

    it("unfollows with DELETE", async () => {
        const fetch = respond(200, { following: false, followers: 10 })
        vi.stubGlobal("fetch", fetch)
        render(<FollowButton username="lift_daily" following />)
        await userEvent.click(screen.getByRole("button", { name: "Unfollow @lift_daily" }))
        await waitFor(() => expect(screen.getByRole("button", { name: "Follow @lift_daily" })).toBeEnabled())
        expect(fetch).toHaveBeenCalledWith("/api/profiles/lift_daily/follow", { method: "DELETE" })
    })

    it("rolls back and links to verification when the server requires an ID", async () => {
        vi.stubGlobal("fetch", respond(403, { code: "verification_required", message: "Verify your ID in Settings to follow people." }))
        render(<FollowButton username="lift_daily" following={false} />)
        await userEvent.click(screen.getByRole("button", { name: "Follow @lift_daily" }))

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent("Verify your ID in Settings to follow people.")
        expect(screen.getByRole("link", { name: "Verify now" })).toHaveAttribute("href", "/settings#verification")
        expect(screen.getByRole("button", { name: "Follow @lift_daily" })).toHaveAttribute("aria-pressed", "false")
    })
})
