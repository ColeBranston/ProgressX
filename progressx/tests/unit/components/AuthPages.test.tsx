// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useContext } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

import Login from "@/app/(secondary)/login/page"
import ConsentPage from "@/app/(secondary)/consent/page"
import PrivacyPolicyPage from "@/app/(secondary)/privacy/page"
import TermsPage from "@/app/(secondary)/terms/page"
import { IsLoadingContext, IsLoadingProvider } from "@/app/contexts/isLoading"
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

function LoadingFlag() {
    return <p>loading: {String(useContext(IsLoadingContext).isLoading)}</p>
}
const renderLogin = () => render(<IsLoadingProvider><Login /><LoadingFlag /></IsLoadingProvider>)
const loading = () => screen.getByText(/^loading:/).textContent

let fetch: ReturnType<typeof vi.fn>
function stubApi(answer: () => Response | Promise<Response>) {
    fetch = vi.fn(async () => answer())
    vi.stubGlobal("fetch", fetch)
}
const body = () => JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))
const tick = (name: RegExp) => user.click(screen.getByRole("checkbox", { name }))
const agreeToAll = async () => { await tick(/18 years of age or older/); await tick(/Terms of Service/) }

async function fillSignUp(password = "hunter22", confirm = password) {
    await user.type(screen.getByPlaceholderText("Email"), "lee@example.com")
    await user.type(screen.getByPlaceholderText("Password"), password)
    await user.type(screen.getByPlaceholderText("Confirm Password"), confirm)
}

beforeEach(() => {
    window.history.replaceState(null, "", "/login")
    sessionStorage.clear()
    vi.stubGlobal("alert", vi.fn())
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("sign up", () => {
    it("creates an account with the agreement, then shows the log in form", async () => {
        stubApi(() => json({ user: { id: "u1" } }))
        localStorage.setItem("lastActivity", "1")
        renderLogin()
        expect(localStorage.getItem("lastActivity")).toBeNull() // a new sign-in starts the idle clock fresh
        await fillSignUp()
        await agreeToAll()
        await user.click(screen.getByRole("button", { name: "Sign Up" }))

        await waitFor(() => expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument())
        expect(fetch).toHaveBeenCalledWith("/api/auth/signup", expect.objectContaining({ method: "POST" }))
        expect(body()).toEqual({ email: "lee@example.com", password: "hunter22", confirmedAge: true, acceptedTerms: true, termsVersion: TERMS_VERSION })
        expect(loading()).toBe("loading: false")
    })

    it("needs both boxes ticked first", async () => {
        stubApi(() => json({}))
        renderLogin()
        await fillSignUp()
        await tick(/18 years of age or older/)
        fireEvent.submit(screen.getByRole("button", { name: "Sign Up" }).closest("form")!) // past the browser's own required check
        expect(screen.getByRole("alert")).toHaveTextContent("Please confirm you're 18 or older and agree to the terms")
        expect(fetch).not.toHaveBeenCalled()
        await tick(/Terms of Service/)
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

    it("catches passwords that don't match", async () => {
        stubApi(() => json({}))
        renderLogin()
        await fillSignUp("hunter22", "hunter23")
        await agreeToAll()
        await user.click(screen.getByRole("button", { name: "Sign Up" }))
        expect(alert).toHaveBeenCalledWith("Passwords don't match")
        expect(fetch).not.toHaveBeenCalled()
    })

    it.each([
        [() => json({}, 429), "Too many attempts. Please wait a minute and try again."],
        [() => new Response("email taken", { status: 400 }), "Signup failed. Check console for details."],
        [() => { throw new TypeError("offline") }, "Network error while signing up."],
    ])("explains a failed sign up (%#)", async (answer, message) => {
        stubApi(answer)
        renderLogin()
        await fillSignUp()
        await agreeToAll()
        await user.click(screen.getByRole("button", { name: "Sign Up" }))
        await waitFor(() => expect(alert).toHaveBeenCalledWith(message))
        expect(loading()).toBe("loading: false")
        expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument()
    })

    it("only lets Google sign-up start once the boxes are ticked, and remembers the agreement", async () => {
        renderLogin()
        const google = screen.getByRole("link", { name: "Sign in with Google" })
        expect(google).toHaveAttribute("href", "/api/auth/login/google")
        await user.click(google)
        expect(screen.getByRole("alert")).toBeInTheDocument()
        expect(sessionStorage.getItem("pendingConsent")).toBeNull()

        await agreeToAll()
        google.addEventListener("click", (e) => e.preventDefault()) // jsdom can't follow the link
        await user.click(google)
        expect(JSON.parse(sessionStorage.getItem("pendingConsent")!)).toEqual({ confirmedAge: true, acceptedTerms: true, termsVersion: TERMS_VERSION })
    })
})

describe("log in", () => {
    const openLogin = async () => {
        renderLogin()
        await user.click(screen.getByRole("button", { name: "Log In" }))
        await user.type(screen.getByPlaceholderText("Email"), "lee@example.com")
        await user.type(screen.getByPlaceholderText("Password"), "hunter22")
    }

    it("logs in and goes to the app", async () => {
        stubApi(() => json({ ok: true }))
        await openLogin()
        expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "/privacy")
        await user.click(screen.getByRole("button", { name: "Log In" }))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/"))
        expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", credentials: "include" }))
        expect(body()).toEqual({ email: "lee@example.com", password: "hunter22" })
    })

    it.each([
        [() => json({}, 429), "Too many attempts. Please wait a minute and try again."],
        [() => new Response("bad password", { status: 401 }), "Login failed. Check console for details."],
        [() => { throw new TypeError("offline") }, "Network error while logging in."],
    ])("explains a failed log in (%#)", async (answer, message) => {
        stubApi(answer)
        await openLogin()
        await user.click(screen.getByRole("button", { name: "Log In" }))
        await waitFor(() => expect(alert).toHaveBeenCalledWith(message))
        expect(push).not.toHaveBeenCalled()
        expect(loading()).toBe("loading: false")
    })

    it("switches back to sign up", async () => {
        renderLogin()
        await user.click(screen.getByRole("button", { name: "Log In" }))
        await user.click(screen.getByRole("button", { name: "Sign Up" }))
        expect(screen.getByPlaceholderText("Confirm Password")).toBeInTheDocument()
    })

    it.each([
        ["idle", "You were logged out after 15 minutes of inactivity. Please log in again.", "/login?next=%2Fmydiet"],
        ["1", "Your session has expired. Please log in again.", "/login?next=%2Fmydiet"],
    ])("explains why someone was sent back (expired=%s) and tidies the address", (reason, message, after) => {
        window.history.replaceState(null, "", `/login?expired=${reason}&next=%2Fmydiet`)
        renderLogin()
        expect(screen.getByRole("status")).toHaveTextContent(message)
        expect(window.location.pathname + window.location.search).toBe(after)
    })

    it("drops a lone expired flag without leaving a stray ?", () => {
        window.history.replaceState(null, "", "/login?expired=1")
        renderLogin()
        expect(window.location.href).toBe(`${window.location.origin}/login`)
    })
})

describe("coming back from Google", () => {
    const backFromGoogle = () => window.history.replaceState(null, "", "/login#access_token=goog&refresh_token=ref")

    it("signs in with Google's tokens, recording an agreement made before leaving, then clears them from the address", async () => {
        sessionStorage.setItem("pendingConsent", JSON.stringify({ confirmedAge: true, acceptedTerms: true, termsVersion: TERMS_VERSION }))
        stubApi(() => json({}))
        backFromGoogle()
        renderLogin()
        expect(window.location.hash).toBe("")
        await waitFor(() => expect(push).toHaveBeenCalledWith("/"))
        expect(body()).toEqual({ token: "goog", refreshToken: "ref", confirmedAge: true, acceptedTerms: true, termsVersion: TERMS_VERSION })
        expect(sessionStorage.getItem("pendingConsent")).toBeNull()
        expect(loading()).toBe("loading: false")
    })

    it("sends no agreement when none was saved, or it can't be read", async () => {
        sessionStorage.setItem("pendingConsent", "{not json")
        stubApi(() => json({}))
        backFromGoogle()
        renderLogin()
        await waitFor(() => expect(push).toHaveBeenCalled())
        expect(body()).toEqual({ token: "goog", refreshToken: "ref" })
    })

    it.each([
        [() => json({}, 429), "Too many attempts. Please wait a minute and try again."],
        [() => new Response("bad token", { status: 401 }), "Signup failed. Check console for details."],
        [() => { throw new TypeError("offline") }, "Network error while signing in with Google."],
    ])("explains a failed Google sign-in (%#)", async (answer, message) => {
        stubApi(answer)
        backFromGoogle()
        renderLogin()
        await waitFor(() => expect(alert).toHaveBeenCalledWith(message))
        expect(push).not.toHaveBeenCalled()
    })
})

describe("consent page", () => {
    let location: { href: string }
    beforeEach(() => {
        location = { href: "http://localhost/consent" }
        vi.stubGlobal("location", location)
    })

    it("records the agreement and continues into the app", async () => {
        stubApi(() => json({ ok: true }))
        render(<ConsentPage />)
        const agree = screen.getByRole("button", { name: "Agree and continue" })
        expect(agree).toBeDisabled()
        await agreeToAll()
        await user.click(agree)
        await waitFor(() => expect(location.href).toBe("/"))
        expect(fetch).toHaveBeenCalledWith("/api/user/consent", expect.objectContaining({ method: "POST" }))
        expect(body()).toEqual({ confirmedAge: true, acceptedTerms: true, termsVersion: TERMS_VERSION })
    })

    it("explains when the agreement can't be saved", async () => {
        stubApi(() => json({ message: "Terms changed, reload" }, 409))
        render(<ConsentPage />)
        await agreeToAll()
        await user.click(screen.getByRole("button", { name: "Agree and continue" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Terms changed, reload")

        stubApi(() => new Response("", { status: 500 }))
        await user.click(screen.getByRole("button", { name: "Agree and continue" }))
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("status 500"))
        expect(location.href).toBe("http://localhost/consent")
    })

    it("does nothing until both boxes are ticked", async () => {
        stubApi(() => json({}))
        render(<ConsentPage />)
        await tick(/18 years of age or older/)
        fireEvent.submit(screen.getByRole("button", { name: "Agree and continue" }).closest("form")!)
        expect(fetch).not.toHaveBeenCalled()
    })

    it("logs out someone who doesn't agree, even offline", async () => {
        localStorage.setItem("userData", "{}")
        stubApi(() => json({}))
        const { unmount } = render(<ConsentPage />)
        await user.click(screen.getByRole("button", { name: "I don't agree, log me out" }))
        await waitFor(() => expect(location.href).toBe("/login"))
        expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" })
        expect(localStorage.getItem("userData")).toBeNull()
        unmount()

        location.href = ""
        stubApi(() => { throw new TypeError("offline") })
        render(<ConsentPage />)
        await user.click(screen.getByRole("button", { name: "I don't agree, log me out" }))
        await waitFor(() => expect(location.href).toBe("/login"))
    })
})

describe("legal pages", () => {
    it("the privacy policy covers who can use the app, health data and how to reach the privacy officer", () => {
        render(<PrivacyPolicyPage />)
        expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument()
        for (const heading of ["01Who can use ProgressX", "04Health and body information", "09Your rights and choices", "12Contact us"]) {
            expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument()
        }
        expect(screen.getByRole("link", { name: "Office of the Privacy Commissioner of Canada" })).toHaveAttribute("href", "https://www.priv.gc.ca")
        expect(screen.getAllByRole("link", { name: "Terms of Service" })[0]).toHaveAttribute("href", "/terms")
        const footer = screen.getByRole("contentinfo")
        expect(within(footer).getByRole("link", { name: "Back to ProgressX" })).toHaveAttribute("href", "/")
    })

    it("the terms cover eligibility, medical advice and governing law, and link to the privacy policy", () => {
        render(<TermsPage />)
        expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument()
        expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(16)
        for (const heading of ["01Eligibility", "03Not medical advice", "13Governing law"]) {
            expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument()
        }
        expect(screen.getAllByRole("link", { name: "Privacy Policy" })[0]).toHaveAttribute("href", "/privacy")
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument()
    })
})
