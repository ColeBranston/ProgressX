// @vitest-environment jsdom
import { useContext } from "react"
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { changedProfileFields, UserDataProvider, userDataContext, UserData } from "@/app/contexts/userData"

const PICTURE = "https://res.cloudinary.com/demo/image/upload/me.jpg"
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

// GET /api/user answers with the saved profile; every POST body is recorded
function stubUserApi(row: Record<string, unknown> | null = { profile_image: PICTURE, profile_bio: "Lifting", profile_privacy: "public" }) {
    const posts: unknown[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== "/api/user") return json({})
        if (init?.method === "POST") {
            posts.push(JSON.parse(String(init.body)))
            return json({ message: "ok" })
        }
        return row ? json({ userData: row }) : json({ message: "Not logged in" }, 401)
    }))
    return posts
}

let setUserData: (update: (prev: UserData) => UserData) => void
let userData: UserData
function Probe() {
    const context = useContext(userDataContext)
    setUserData = context.setUserData
    userData = context.userData
    return null
}

const mount = async () => {
    render(<UserDataProvider><Probe /></UserDataProvider>)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}
const waitOutDebounce = () => act(async () => { await vi.advanceTimersByTimeAsync(11_000) })

beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe("changedProfileFields", () => {
    it("returns only the synced fields that differ from the server", () => {
        expect(changedProfileFields(
            { pfp: PICTURE, bio: "New bio", privacy: "public", followers: 12, weight: 180 },
            { pfp: PICTURE, bio: "Old bio", privacy: "public" },
        )).toEqual({ bio: "New bio" })
    })

    it("treats missing and null as the same", () => {
        expect(changedProfileFields({ pfp: null, bio: null }, { bio: undefined as unknown as null })).toEqual({})
    })
})

describe("UserDataProvider sync", () => {
    it("never sends a stale empty picture from localStorage", async () => {
        localStorage.setItem("userData", JSON.stringify({ username: "me", pfp: null, bio: null, privacy: "private", followers: 0 }))
        const posts = stubUserApi()
        await mount()

        // the saved profile replaces the stale copy
        expect(userData).toMatchObject({ pfp: PICTURE, bio: "Lifting", privacy: "public" })

        // an unrelated change (the follower count refresh on the profile page) sends nothing
        act(() => setUserData((prev) => ({ ...prev, followers: 3 })))
        await waitOutDebounce()
        expect(posts).toEqual([])
    })

    it("sends nothing in a fresh browser with the default profile", async () => {
        const posts = stubUserApi()
        await mount()
        act(() => setUserData((prev) => ({ ...prev, likes: 1 })))
        await waitOutDebounce()
        expect(posts).toEqual([])
    })

    it("sends just the field that was edited", async () => {
        const posts = stubUserApi()
        await mount()
        act(() => setUserData((prev) => ({ ...prev, bio: "Cutting" })))
        await waitOutDebounce()
        expect(posts).toEqual([{ user: { bio: "Cutting" } }])

        // once saved, the same value isn't sent again
        act(() => setUserData((prev) => ({ ...prev, followers: 5 })))
        await waitOutDebounce()
        expect(posts).toHaveLength(1)
    })

    it("clears the picture only when it's removed on purpose", async () => {
        const posts = stubUserApi()
        await mount()
        act(() => setUserData((prev) => ({ ...prev, pfp: null })))
        await waitOutDebounce()
        expect(posts).toEqual([{ user: { pfp: null } }])
    })

    it("doesn't send anything while logged out", async () => {
        const posts = stubUserApi(null)
        await mount()
        act(() => setUserData((prev) => ({ ...prev, bio: "Hi" })))
        await waitOutDebounce()
        expect(posts).toEqual([])
    })
})
