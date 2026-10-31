// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Onboarding from "@/app/(secondary)/onboarding/page"
import VerifyHint from "@/app/internal_components/verification/VerifyHint"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

const replace = vi.fn()
let verification: { available: boolean, status: { state: string } }
let saved: unknown

beforeEach(() => {
    replace.mockReset()
    saved = undefined
    verification = { available: true, status: { state: "none" } }
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, replace } })
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
        if (url === "/api/auth") return json({ user: "new@example.com" })
        if (url.startsWith("/api/user/onboarding") && init?.method === "POST") { saved = JSON.parse(String(init.body)); return json({ ok: true }) }
        if (url.startsWith("/api/user/onboarding")) return json({ available: true })
        if (url === "/api/verification") return json(verification)
        throw new Error(`unexpected fetch ${url}`)
    }))
})
afterEach(() => vi.unstubAllGlobals())

async function fillDetails() {
    const user = userEvent.setup({ delay: null }) // no pause between keystrokes: quick on a busy machine
    await user.type(screen.getByLabelText("Name"), "New Person")
    await user.type(screen.getByLabelText("Username"), "newperson")
    await screen.findByText(/Available/)
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await user.type(screen.getByLabelText("Age"), "30")
    await user.click(screen.getByRole("radio", { name: "Other" }))
    await user.type(screen.getByLabelText("Feet"), "5")
    await user.type(screen.getByLabelText("Inches"), "10")
    await user.type(screen.getByLabelText(/Weight in lb/), "175")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await user.click(screen.getByRole("radio", { name: /Moderately active/ }))
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await screen.findByRole("heading", { name: "Your privacy" })
    return user
}

describe("onboarding's privacy step", () => {
    it("starts private with everything only me, and saves what they choose with the details", async () => {
        render(<Onboarding />)
        const user = await fillDetails()
        expect(screen.getByRole("radio", { name: "Private" })).toHaveAttribute("aria-checked", "true")
        for (const kind of ["progress photos", "weight", "workouts", "diet"]) {
            expect(within(screen.getByRole("radiogroup", { name: `Who sees your ${kind}` })).getByRole("radio", { name: "Only me" })).toHaveAttribute("aria-checked", "true")
        }

        await user.click(screen.getByRole("radio", { name: "Public" }))
        await user.click(within(screen.getByRole("radiogroup", { name: "Who sees your progress photos" })).getByRole("radio", { name: "Everyone" }))
        await user.click(within(screen.getByRole("radiogroup", { name: "Who sees your workouts" })).getByRole("radio", { name: "Followers" }))
        await user.click(screen.getByRole("button", { name: "Save and continue" }))
        await screen.findByRole("heading", { name: "Verify your ID" })
        expect(saved).toMatchObject({ privacy: "public", sharing: { photos: "everyone", weight: "only_me", workouts: "followers", diet: "only_me" } })
    })
})

describe("onboarding's ID step", () => {
    it("saves the details first, then offers to verify, and skipping goes to the app", async () => {
        render(<Onboarding />)
        const user = await fillDetails()
        await user.click(screen.getByRole("button", { name: "Save and continue" }))
        expect(await screen.findByRole("heading", { name: "Verify your ID" })).toBeInTheDocument()
        expect(saved).toMatchObject({ username: "newperson", age: 30 })
        expect(replace).not.toHaveBeenCalled()

        await user.click(screen.getByRole("button", { name: "Verify ID" }))
        expect(screen.getByRole("dialog", { name: "Verify your ID" })).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Cancel" }))

        await user.click(screen.getByRole("button", { name: "Skip for now" }))
        expect(replace).toHaveBeenCalledWith("/")
    })

    it("goes straight to the app where ID verification isn't set up", async () => {
        verification = { available: false, status: { state: "none" } }
        render(<Onboarding />)
        const user = await fillDetails()
        await user.click(screen.getByRole("button", { name: "Save and continue" }))
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/"))
    })
})

describe("VerifyHint", () => {
    it("adds a Verify now link only to the not-verified message", () => {
        const { rerender } = render(<p><VerifyHint message="Verify your ID in Settings to like videos." /></p>)
        expect(screen.getByRole("link", { name: "Verify now" })).toHaveAttribute("href", "/settings#verification")
        rerender(<p><VerifyHint message="Couldn't save that" /></p>)
        expect(screen.queryByRole("link", { name: "Verify now" })).toBeNull()
    })
})
