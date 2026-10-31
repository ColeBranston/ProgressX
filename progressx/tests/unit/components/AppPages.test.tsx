// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToStaticMarkup } from "react-dom/server"
import { useContext } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }))
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "geist" }), Geist_Mono: () => ({ variable: "geist-mono" }) }))
const cookieNames = new Set<string>()
vi.mock("next/headers", () => ({ cookies: async () => ({ has: (name: string) => cookieNames.has(name) }) }))
const findProfileByUsername = vi.fn()
vi.mock("@/app/api/libs/videos", () => ({ findProfileByUsername: (...args: unknown[]) => findProfileByUsername(...args) }))
// the heavy pieces each page hosts have their own tests
vi.mock("@/app/internal_components/videos/ForYouFeed", () => ({ default: ({ source }: { source?: string }) => <p>feed: {source ?? "for you"}</p> }))
vi.mock("@/app/internal_components/search/SearchResults", () => ({ default: () => <p>search results</p> }))
vi.mock("@/app/internal_pages/profile_web", () => ({ default: () => <p>my profile</p> }))
vi.mock("@/app/internal_pages/other_profile", () => ({ default: ({ username }: { username: string }) => <p>profile of {username}</p> }))
vi.mock("@/app/internal_components/releases/ReleaseNotes", () => ({ default: () => <p>release notes</p> }))
vi.mock("@/app/internal_components/SessionWatch", () => ({ default: () => <p>session watch</p> }))

import RootLayout from "@/app/layout"
import MainLayout from "@/app/(main)/layout"
import Home from "@/app/(main)/page"
import ExplorePage from "@/app/(main)/explore/page"
import FollowingPage from "@/app/(main)/following/page"
import SearchPage from "@/app/(main)/search/page"
import ProfilePage from "@/app/(main)/profile/page"
import UserProfilePage from "@/app/(main)/profile/[username]/page"
import ProfileLayout, { generateMetadata } from "@/app/(main)/profile/[username]/layout"
import UploadPage from "@/app/(main)/upload/page"
import LoginLayout from "@/app/(secondary)/login/layout"
import LoadingScreen from "@/app/internal_components/LoadingScreen"
import { IsLoadingContext, IsLoadingProvider } from "@/app/contexts/isLoading"
import { userDataContext } from "@/app/contexts/userData"
import { GET as adsTxt } from "@/app/ads.txt/route"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    cookieNames.clear()
})

describe("root layout", () => {
    it("wraps every page in the providers and the loading screen", () => {
        const html = renderToStaticMarkup(<RootLayout><p>page</p></RootLayout>)
        expect(html).toContain('<html lang="en">')
        expect(html).toContain('class="geist geist-mono"')
        expect(html).toContain("<p>page</p>")
    })
})

describe("app layout", () => {
    it("watches the session and shows release notes for someone signed in", async () => {
        cookieNames.add("token")
        render(await MainLayout({ children: <p>page</p> }))
        expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument()
        expect(screen.getByText("session watch")).toBeInTheDocument()
        expect(screen.getByText("release notes")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument()
    })

    it("counts a refresh token alone as signed in", async () => {
        cookieNames.add("refresh_token")
        render(await MainLayout({ children: <p>page</p> }))
        expect(screen.getByText("session watch")).toBeInTheDocument()
    })

    it("leaves both out for a visitor", async () => {
        render(await MainLayout({ children: <p>page</p> }))
        expect(screen.getByText("page")).toBeInTheDocument()
        expect(screen.queryByText("session watch")).not.toBeInTheDocument()
        expect(screen.queryByText("release notes")).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument()
    })
})

describe("For You page", () => {
    const mount = () => {
        const setUserData = vi.fn()
        render(<userDataContext.Provider value={{ userData: {}, setUserData }}><Home /></userDataContext.Provider>)
        return setUserData
    }

    it("loads the profile into the app's user data and shows the feed", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => json({ userData: {
            display_username: "lifter", display_name: "Lee", email: "lee@example.com", age: 30, profile_image: null, profile_bio: "hi",
            profile_privacy: "public", gender: "f", height_cm: 170, weight_lbs: 150, followers_count: 3, following_count: 4, likes_count: 5, activity_level: 2,
        } })))
        const setUserData = mount()
        expect(screen.getByText("feed: for you")).toBeInTheDocument()
        await waitFor(() => expect(setUserData).toHaveBeenCalledWith({
            username: "lifter", name: "Lee", email: "lee@example.com", age: 30, pfp: null, bio: "hi", privacy: "public", gender: "f",
            height: 170, weight: 150, followers: 3, following: 4, likes: 5, activity: 2,
        }))
    })

    it("keeps the current data when the profile can't load", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Not logged in" }, 401)))
        const setUserData = mount()
        await waitFor(() => expect(error).toHaveBeenCalledWith("Error Fetching User Info: ", { message: "Not logged in" }))
        expect(setUserData).not.toHaveBeenCalled()
    })
})

describe("feed and profile pages", () => {
    it("explore shows the public feed and following shows followed people's videos", () => {
        render(<><ExplorePage /><FollowingPage /></>)
        expect(screen.getByText("feed: for you")).toBeInTheDocument()
        expect(screen.getByText("feed: following")).toBeInTheDocument()
    })

    it("search and my profile host their components", () => {
        render(<><SearchPage /><ProfilePage /></>)
        expect(screen.getByText("search results")).toBeInTheDocument()
        expect(screen.getByText("my profile")).toBeInTheDocument()
    })

    it("decodes the username in someone else's profile address", async () => {
        await act(async () => { render(<UserProfilePage params={Promise.resolve({ username: "lift%20daily" })} />) })
        expect(await screen.findByText("profile of lift daily")).toBeInTheDocument()
    })

    it("keeps a username that isn't valid percent-encoding as it is", async () => {
        await act(async () => { render(<UserProfilePage params={Promise.resolve({ username: "100%" })} />) })
        expect(await screen.findByText("profile of 100%")).toBeInTheDocument()
    })

    it("layouts pass their page through", () => {
        expect(ProfileLayout({ children: "x", params: Promise.resolve({ username: "a" }) })).toBe("x")
        expect(LoginLayout({ children: "y" })).toBe("y")
    })
})

describe("profile page details for search engines", () => {
    const params = (username: string) => Promise.resolve({ username })

    it("indexes a public profile under its name and bio", async () => {
        findProfileByUsername.mockResolvedValue({ display_username: "lift daily", display_name: "Lee", profile_bio: " Squats ", profile_privacy: "public" })
        expect(await generateMetadata({ params: params("lift%20daily") })).toEqual({
            title: "Lee (@lift daily) | ProgressX",
            description: "Squats",
            alternates: { canonical: "/profile/lift%20daily" },
        })
        expect(findProfileByUsername).toHaveBeenCalledWith("lift daily", expect.any(String))
    })

    it("describes a public profile without a name or bio", async () => {
        findProfileByUsername.mockResolvedValue({ display_username: "lee", display_name: null, profile_bio: null, profile_privacy: "public" })
        const meta = await generateMetadata({ params: params("100%") })
        expect(meta.title).toBe("@lee | ProgressX")
        expect(meta.description).toBe("Workout and fitness videos from @lee on ProgressX.")
        expect(findProfileByUsername).toHaveBeenCalledWith("100%", expect.any(String))
    })

    it("keeps private, unknown and unloadable profiles out of the index", async () => {
        const hidden = { title: "Profile | ProgressX", robots: { index: false, follow: false } }
        findProfileByUsername.mockResolvedValueOnce({ display_username: "lee", profile_privacy: "private" })
        expect(await generateMetadata({ params: params("lee") })).toEqual(hidden)
        findProfileByUsername.mockResolvedValueOnce(null)
        expect(await generateMetadata({ params: params("nobody") })).toEqual(hidden)
        vi.spyOn(console, "log").mockImplementation(() => {})
        findProfileByUsername.mockRejectedValueOnce(new Error("db down"))
        expect(await generateMetadata({ params: params("lee") })).toEqual(hidden)
        findProfileByUsername.mockRejectedValueOnce("odd failure")
        expect(await generateMetadata({ params: params("lee") })).toEqual(hidden)
    })
})

describe("upload page", () => {
    it("leads to the video and photo upload forms", async () => {
        render(<UploadPage />)
        await user.click(screen.getByRole("button", { name: "Videos" }))
        expect(push).toHaveBeenLastCalledWith("/profile?page=videos&videoSubmit=true")
        await user.click(screen.getByRole("button", { name: "Photos" }))
        expect(push).toHaveBeenLastCalledWith("/profile?page=photos&photoSubmit=true")
    })
})

describe("loading screen", () => {
    function Toggle() {
        const { setIsLoading } = useContext(IsLoadingContext)
        return <button type="button" onClick={() => setIsLoading((v) => !v)}>toggle</button>
    }

    it("shows a spinner only while something is loading", async () => {
        render(<IsLoadingProvider><LoadingScreen /><Toggle /></IsLoadingProvider>)
        expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "toggle" }))
        expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument()
    })
})

describe("GET /ads.txt", () => {
    it("is 404 until ads are set up", async () => {
        vi.stubEnv("ADS_TXT", "")
        const res = adsTxt()
        expect(res.status).toBe(404)
    })

    it("lists the authorized sellers", async () => {
        vi.stubEnv("ADS_TXT", "google.com, pub-1, DIRECT")
        const res = adsTxt()
        expect(res.status).toBe(200)
        expect(await res.text()).toBe("google.com, pub-1, DIRECT\n")
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600")
    })
})
