// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { json } from "../../helpers/uiStubs"

const push = vi.fn()
const back = vi.fn()
const router = { push, back }
let params: Record<string, string | string[] | undefined> = {}
let search = new URLSearchParams()
vi.mock("next/dist/client/components/navigation", () => ({ useRouter: () => router, useParams: () => params, useSearchParams: () => search }))

import ResearchPage from "@/app/(main)/research/[[...query]]/page"
import StudyPage from "@/app/(main)/research/doc/[id]/page"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const doc = (n: number) => ({ id: `https://pubmed.example/${n}`, journal: `Journal ${n}`, title: `Study ${n}` })
const facets = { year: [{ value: "2021", count: 4 }], journal: [{ value: "Journal 1", count: 2 }] }

let fetch: ReturnType<typeof vi.fn>
function stubApi(routes: Record<string, () => Response | Promise<Response>>) {
    fetch = vi.fn(async (url: string) => {
        const route = routes[url]
        if (!route) throw new Error(`unexpected ${url}`)
        return route()
    })
    vi.stubGlobal("fetch", fetch)
}
const searchBox = () => screen.getByPlaceholderText("Search for optimal workouts...")

beforeEach(() => {
    params = {}
    search = new URLSearchParams()
    vi.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("research search", () => {
    it("shows recently searched studies before any search, and opens one", async () => {
        stubApi({ "/api/search/cached": () => json({ docs: [doc(1), doc(2)] }) })
        render(<ResearchPage />)
        expect(await screen.findByText("Recent Searches")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: /Study 2/ }))
        expect(push).toHaveBeenCalledWith(`/research/doc/${Buffer.from(doc(2).id).toString("base64url")}`)
        expect(fetch).toHaveBeenCalledWith("/api/search/cached", { method: "GET", credentials: "omit" })
    })

    it("shows nothing extra when the recent searches can't load", async () => {
        stubApi({ "/api/search/cached": () => json({}, 500) })
        render(<ResearchPage />)
        expect(await screen.findByText("Recent Searches")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Study/ })).not.toBeInTheDocument()
    })

    it("searches for what was typed, starting at the first page", async () => {
        stubApi({ "/api/search/cached": () => json({ docs: [] }) })
        render(<ResearchPage />)
        await screen.findByText("Recent Searches")
        fireEvent.submit(searchBox().closest("form")!)
        expect(push).not.toHaveBeenCalled() // nothing typed
        await user.type(searchBox(), "creatine & sleep{Enter}")
        expect(push).toHaveBeenCalledWith("/research/0/creatine%20%26%20sleep")
    })

    it("shows placeholder cards while a search loads, then the results", async () => {
        params = { query: ["0", "creatine"] }
        let answer: (res: Response) => void = () => {}
        stubApi({ "/api/search/search/0/creatine": () => new Promise<Response>((resolve) => { answer = resolve }) })
        render(<ResearchPage />)
        expect(screen.getByRole("status", { name: "Loading results" })).toHaveAttribute("aria-busy", "true")
        expect(screen.getAllByTestId("study-card-skeleton")).toHaveLength(4)
        expect(screen.queryByRole("button", { name: /Study [0-9]/ })).not.toBeInTheDocument()

        answer(json({ docs: [doc(1)], hits: 1, facets }))
        expect(await screen.findByRole("button", { name: /Study 1/ })).toBeInTheDocument()
        expect(screen.queryByRole("status", { name: "Loading results" })).not.toBeInTheDocument()
        // the filters sit in the same row as the search box
        expect(searchBox().closest("form")?.parentElement?.parentElement).toContainElement(screen.getByRole("group", { name: "Filter results" }))
    })

    it("shows a page of results with filters and page numbers", async () => {
        params = { query: ["12", "creatine"] }
        search = new URLSearchParams("year=2021")
        stubApi({ "/api/search/search/12/creatine?year=2021": () => json({ docs: [doc(1), doc(2)], hits: 200, facets }) })
        render(<ResearchPage />)
        expect(await screen.findByText("CREATINE")).toBeInTheDocument()
        expect(screen.getByText("Search Results: 200")).toBeInTheDocument()
        expect(screen.getAllByRole("button", { name: /Study [0-9]/ })).toHaveLength(2)

        // 20 pages: ten numbers, keeping five before the current one
        const pages = screen.getAllByRole("button", { name: /^Page / })
        expect(pages.map((p) => p.textContent)).toEqual(["7", "8", "9", "10", "11", "12", "13", "14", "15", "16"])
        expect(screen.getByRole("button", { name: "Page 12" })).toHaveAttribute("aria-current", "page")
        await user.click(screen.getByRole("button", { name: "Page 13" }))
        expect(push).toHaveBeenLastCalledWith("/research/13/creatine?year=2021")

        // the filters sit in the search row; picking a journal starts again from page 0
        const filters = screen.getByRole("group", { name: "Filter results" })
        await user.click(within(filters).getByRole("button", { name: "Journal" }))
        await user.click(within(filters).getByRole("checkbox", { name: "Journal 1, 2 studies" }))
        expect(push).toHaveBeenLastCalledWith(expect.stringMatching(/^\/research\/0\/creatine\?.*journal=Journal\+1/))
        await user.click(within(filters).getByRole("button", { name: "Clear filters" }))
        expect(push).toHaveBeenLastCalledWith("/research/0/creatine")
    })

    it("scrolls the results sideways with the mouse wheel", async () => {
        params = { query: ["0", "sleep"] }
        stubApi({ "/api/search/search/0/sleep": () => json({ docs: [doc(1)], hits: 1 }) })
        render(<ResearchPage />)
        const card = await screen.findByRole("button", { name: /Study 1/ })
        const scroller = card.parentElement!.parentElement!
        fireEvent.wheel(scroller, { deltaY: 0 })
        expect(scroller.scrollLeft).toBe(0)
        fireEvent.wheel(scroller, { deltaY: 40 })
        expect(scroller.scrollLeft).toBe(40)
    })

    it("says when nothing matched, and suggests clearing filters if any are on", async () => {
        params = { query: ["x", "zzz"] } // a page that isn't a number is the first page
        search = new URLSearchParams("journal=Nature")
        stubApi({ "/api/search/search/0/zzz?journal=Nature": () => json({ docs: [], hits: 0 }) })
        render(<ResearchPage />)
        expect(await screen.findByText("No results found, try changing your search or clearing the filters")).toBeInTheDocument()
    })

    it("treats a missing results list as no results", async () => {
        params = { query: ["0", "zzz"] }
        stubApi({ "/api/search/search/0/zzz": () => json({}) })
        render(<ResearchPage />)
        expect(await screen.findByText("No results found, try changing your search")).toBeInTheDocument()
        expect(screen.getByText("Search Results: 0")).toBeInTheDocument()
    })

    it("waits for a search when the address has a page but no words, and ignores a failed search", async () => {
        params = { query: ["3"] }
        stubApi({})
        const { unmount } = render(<ResearchPage />)
        expect(await screen.findByText("Recent Searches")).toBeInTheDocument()
        expect(fetch).not.toHaveBeenCalled()
        unmount()

        params = { query: ["0", "bad"] }
        stubApi({ "/api/search/search/0/bad": () => json({}, 502) })
        render(<ResearchPage />)
        expect(await screen.findByText("Recent Searches")).toBeInTheDocument()
    })

    it("shows only the newest search's results when an older one finishes late", async () => {
        let finishOld: (res: Response) => void = () => {}
        params = { query: ["0", "old"] }
        stubApi({
            "/api/search/search/0/old": () => new Promise<Response>((resolve) => { finishOld = resolve }),
            "/api/search/search/0/new": () => json({ docs: [doc(2)], hits: 1 }),
        })
        const { rerender } = render(<ResearchPage />)
        params = { query: ["0", "new"] }
        rerender(<ResearchPage />)
        expect(await screen.findByText("NEW")).toBeInTheDocument()
        finishOld(json({ docs: [doc(1)], hits: 1 }))
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
        expect(screen.queryByText("OLD")).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Study 2/ })).toBeInTheDocument()
    })
})

describe("a study", () => {
    it("shows the study's journal, title, date and text in paragraphs", async () => {
        params = { id: "abc" }
        const sentences = Array.from({ length: 6 }, (_, i) => `Sentence ${i + 1}`).join(". ")
        stubApi({ "/api/search/doc/abc": () => json({ docs: [{ ...doc(7), published: "2024-05-01", content: sentences }] }) })
        render(<StudyPage />)
        expect(await screen.findByText("Study 7")).toBeInTheDocument()
        expect(screen.getByText("2024-05-01")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "See More" })).toHaveAttribute("href", "https://pubmed.example/7")
        expect(screen.getByText("Sentence 1. Sentence 2. Sentence 3. Sentence 4")).toBeInTheDocument()
        expect(screen.getByText("Sentence 5. Sentence 6")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: /Journal 7/ }))
        expect(back).toHaveBeenCalled()
    })

    it("shows a study without text", async () => {
        params = { id: "abc" }
        stubApi({ "/api/search/doc/abc": () => json({ docs: [doc(8)] }) })
        render(<StudyPage />)
        expect(await screen.findByText("Study 8")).toBeInTheDocument()
    })

    it("goes back to the search for an unknown or missing study", async () => {
        params = { id: "nope" }
        stubApi({ "/api/search/doc/nope": () => json({ docs: [] }) })
        const { unmount } = render(<StudyPage />)
        await waitFor(() => expect(push).toHaveBeenCalledWith("/research"))
        unmount()

        push.mockClear()
        stubApi({ "/api/search/doc/broken": () => new Response("<html>", { status: 500 }) })
        params = { id: "broken" }
        const second = render(<StudyPage />)
        await waitFor(() => expect(push).toHaveBeenCalledWith("/research"))
        second.unmount()

        push.mockClear()
        params = {}
        stubApi({})
        render(<StudyPage />)
        await waitFor(() => expect(push).toHaveBeenCalledWith("/research"))
        expect(fetch).not.toHaveBeenCalled()
    })
})
