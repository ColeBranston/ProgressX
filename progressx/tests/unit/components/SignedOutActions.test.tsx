// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import FollowButton from "@/app/internal_components/follows/FollowButton"
import { ViewerProvider } from "@/app/contexts/viewer"

const original = window.location
let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
    assign = vi.fn()
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } })
})
afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original })
    vi.unstubAllGlobals()
})

describe("actions that need an account", () => {
    it("sends a visitor who isn't signed in to the login page instead of following", async () => {
        const fetch = vi.fn()
        vi.stubGlobal("fetch", fetch)
        render(<ViewerProvider signedIn={false}><FollowButton username="lift_daily" following={false} /></ViewerProvider>)

        await userEvent.click(screen.getByRole("button", { name: "Follow @lift_daily" }))
        expect(assign).toHaveBeenCalledWith("/login")
        expect(fetch).not.toHaveBeenCalled()
        expect(screen.getByRole("button", { name: "Follow @lift_daily" })).toHaveAttribute("aria-pressed", "false")
    })
})
