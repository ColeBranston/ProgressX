// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()
let pathname = "/"
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname }))

import Navbar from "@/app/internal_components/Navbar"
import { ViewerProvider } from "@/app/contexts/viewer"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const renderNav = (signedIn = true) => render(<ViewerProvider signedIn={signedIn}><Navbar /></ViewerProvider>)
const nav = () => screen.getByRole("navigation", { name: "Main" })

beforeEach(() => {
    pathname = "/"
    window.history.replaceState(null, "", "/")
})
afterEach(() => vi.clearAllMocks())

describe("Navbar", () => {
    it.each([["For You", "/"], ["Research", "/research"], ["Following", "/following"], ["Upload", "/upload"], ["MyStats", "/mystats"], ["MyDiet", "/mydiet"], ["Profile", "/profile"]])("goes to %s", async (name, path) => {
        renderNav()
        await user.click(within(nav()).getByRole("button", { name }))
        expect(push).toHaveBeenCalledWith(path)
    })

    it("links to the company pages and the terms", () => {
        renderNav()
        expect(within(nav()).getByRole("link", { name: "Terms & Policies" })).toHaveAttribute("href", "/terms")
        expect(within(nav()).getByRole("link", { name: "Company" })).toHaveAttribute("href", "/homepage")
    })

    it("works from the keyboard", async () => {
        renderNav()
        within(nav()).getByRole("button", { name: "Research" }).focus()
        await user.keyboard("{Enter}")
        expect(push).toHaveBeenLastCalledWith("/research")
        within(nav()).getByRole("button", { name: "Following" }).focus()
        await user.keyboard(" ")
        expect(push).toHaveBeenLastCalledWith("/following")
        await user.keyboard("a")
        expect(push).toHaveBeenCalledTimes(2)
    })

    it("sends signed-out visitors to the public feed and the login page", async () => {
        renderNav(false)
        await user.click(within(nav()).getByRole("button", { name: "For You" }))
        expect(push).toHaveBeenLastCalledWith("/explore")
        await user.click(within(nav()).getByRole("button", { name: "Log in" }))
        expect(push).toHaveBeenLastCalledWith("/login")
        expect(within(nav()).queryByRole("button", { name: "Profile" })).not.toBeInTheDocument()
    })

    it("searches for what was typed, and ignores an empty search", async () => {
        renderNav()
        const box = screen.getByRole("searchbox", { name: "Search videos and people" })
        await user.type(box, "   {Enter}")
        expect(push).not.toHaveBeenCalled()
        await user.type(box, "deadlift form{Enter}")
        expect(push).toHaveBeenCalledWith("/search?q=deadlift+form")
    })

    it("keeps the words and the tab on the search results page", async () => {
        pathname = "/search"
        window.history.replaceState(null, "", "/search?q=squat&tab=people")
        renderNav()
        const box = screen.getByRole("searchbox", { name: "Search videos and people" })
        expect(box).toHaveValue("squat")
        await user.clear(box)
        await user.type(box, "bench{Enter}")
        expect(push).toHaveBeenCalledWith("/search?q=bench&tab=people")
    })

    it("opens the menu on small screens and closes it with the button, Escape or the backdrop", async () => {
        const { container } = renderNav()
        const open = screen.getByRole("button", { name: "Open menu" })
        expect(open).toHaveAttribute("aria-expanded", "false")

        await user.click(open)
        expect(open).toHaveAttribute("aria-expanded", "true")
        expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus()
        await user.keyboard("{Escape}")
        expect(open).toHaveAttribute("aria-expanded", "false")
        expect(open).toHaveFocus()

        await user.click(open)
        await user.keyboard("x") // other keys leave it open
        expect(open).toHaveAttribute("aria-expanded", "true")
        await user.click(screen.getByRole("button", { name: "Close menu" }))
        expect(open).toHaveAttribute("aria-expanded", "false")

        await user.click(open)
        await user.click(container.querySelector("[aria-hidden='true']:not(svg)")!) // the backdrop
        expect(open).toHaveAttribute("aria-expanded", "false")
    })
})
