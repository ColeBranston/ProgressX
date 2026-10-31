// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FakeIntersectionObserver, stubIntersectionObserver, stubMatchMedia } from "../../helpers/uiStubs"

// three.js can't run here: a stand-in scene that records what the page tells it
const scene = { setTimeline: vi.fn(), setPointer: vi.fn(), dispose: vi.fn() }
const createHomeScene = vi.fn<(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }) => typeof scene>(() => scene)
vi.mock("@/app/internal_components/homepage/scene", () => ({ createHomeScene: (...args: Parameters<typeof createHomeScene>) => createHomeScene(...args) }))

import Homepage from "@/app/internal_components/homepage/Homepage"
import HomepageRoute from "@/app/homepage/page"

// these render whole pages in jsdom, which can take more than 5s on a busy machine
vi.setConfig({ testTimeout: 20_000 })

// no pause between keystrokes: typing stays quick on a busy machine
const user = userEvent.setup({ delay: null })

const scrollTo = vi.fn()

// jsdom lays nothing out: give the page a hero, a 5000px story and a call to action near the bottom
function layOut() {
    const hero = document.getElementById("top")!
    const scroller = hero.parentElement!
    const story = document.getElementById("story")!
    const cta = screen.getByRole("heading", { name: /Your next PR/ }).closest("section")!
    const set = (el: HTMLElement, props: Record<string, number>) => {
        for (const [key, value] of Object.entries(props)) Object.defineProperty(el, key, { configurable: true, value })
    }
    set(scroller, { clientHeight: 800, scrollHeight: 10_000 })
    set(hero, { offsetHeight: 800 })
    set(story, { offsetTop: 1000, offsetHeight: 5000 })
    set(cta, { offsetTop: 9000 })
    return scroller
}
async function scrollTo_(scroller: HTMLElement, y: number) {
    scroller.scrollTop = y
    fireEvent.scroll(scroller)
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
}
const activeChapter = () => within(screen.getByRole("article")).getByRole("heading", { level: 2 })

beforeEach(() => {
    stubIntersectionObserver()
    stubMatchMedia(false)
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({}) as RenderingContext)
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo
    createHomeScene.mockImplementation(() => scene)
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("Homepage", () => {
    it("shows the pitch with sign-up, explore and legal links", () => {
        render(<HomepageRoute />)
        expect(screen.getByRole("heading", { level: 1, name: "Built for progress." })).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Start for free" })).toHaveAttribute("href", "/login")
        expect(screen.getByRole("link", { name: "Watch videos" })).toHaveAttribute("href", "/explore")
        const footer = screen.getByRole("navigation", { name: "Footer" })
        expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
        expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy")
        expect(within(footer).getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research")
    })

    it("starts the 3D scene and drives it from scrolling and the pointer", async () => {
        const { unmount } = render(<Homepage />)
        await waitFor(() => expect(createHomeScene).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), { reducedMotion: false }))
        const scroller = layOut()

        await scrollTo_(scroller, 400) // halfway through the hero
        expect(activeChapter()).toHaveTextContent("Every rep,on the record.")
        expect(scene.setTimeline).toHaveBeenLastCalledWith(expect.closeTo(400 / 680, 3))
        await scrollTo_(scroller, 3000) // the story's third chapter
        expect(activeChapter()).toHaveTextContent("Eat like you")
        expect(scene.setTimeline.mock.lastCall![0]).toBeGreaterThan(3)
        await scrollTo_(scroller, 4800) // the last chapter
        expect(activeChapter()).toHaveTextContent("This is")
        await scrollTo_(scroller, 5200 + 360) // past the story: the particles burst
        expect(scene.setTimeline.mock.lastCall![0]).toBeCloseTo(6.5, 3)
        await scrollTo_(scroller, 9000) // the call to action: they gather again
        expect(scene.setTimeline.mock.lastCall![0]).toBeGreaterThan(7)

        fireEvent.mouseMove(scroller, { clientX: 0, clientY: 0 })
        expect(scene.setPointer).toHaveBeenCalledWith(-1, 1)

        unmount()
        expect(scene.dispose).toHaveBeenCalled()
    })

    it("asks for reduced motion when the visitor prefers it, and shows the final numbers straight away", async () => {
        stubMatchMedia(true)
        render(<Homepage />)
        await waitFor(() => expect(createHomeScene).toHaveBeenCalledWith(expect.anything(), { reducedMotion: true }))
        expect(screen.getByText("57")).toBeInTheDocument()
        expect(screen.getByText("Micronutrients in your daily score").previousSibling).toHaveTextContent("22")
    })

    it("counts the numbers up once they scroll into view", async () => {
        // frames timed on the same clock the counter reads (jsdom's own frames use the window's clock)
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16))
        render(<Homepage />)
        const exercises = screen.getByText("Exercises with animated form guides").previousSibling as HTMLElement
        expect(exercises).toHaveTextContent("0")
        act(() => FakeIntersectionObserver.show())
        await waitFor(() => expect(exercises).toHaveTextContent("57"), { timeout: 3000 })
    })

    it("stops watching a section once it has been revealed", () => {
        render(<Homepage />)
        const reveal = FakeIntersectionObserver.all.find((o) => o.options?.threshold === 0.18)!
        const watched = reveal.observed.size
        expect(watched).toBeGreaterThan(0)
        act(() => FakeIntersectionObserver.show(false))
        expect(reveal.observed.size).toBe(watched)
        act(() => FakeIntersectionObserver.show())
        expect(reveal.unobserve).toHaveBeenCalledTimes(watched)
    })

    it("works as a plain page without WebGL", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null)
        render(<Homepage />)
        await act(async () => {})
        expect(createHomeScene).not.toHaveBeenCalled()
        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
    })

    it("waits for the hero title to finish animating in before starting the scene", async () => {
        let finish!: () => void
        const finished = new Promise<void>((resolve) => { finish = resolve })
        const getAnimations = vi.fn(() => [{ finished }] as unknown as Animation[])
        Element.prototype.getAnimations = getAnimations
        try {
            render(<Homepage />)
            await act(async () => {})
            expect(getAnimations).toHaveBeenCalledWith({ subtree: true })
            expect(createHomeScene).not.toHaveBeenCalled()

            finish()
            await waitFor(() => expect(createHomeScene).toHaveBeenCalled())
        } finally {
            delete (Element.prototype as Partial<Element>).getAnimations
        }
    })

    it("starts the scene anyway if the title animation never finishes", async () => {
        vi.useFakeTimers()
        Element.prototype.getAnimations = () => [{ finished: new Promise(() => {}) }] as unknown as Animation[]
        try {
            render(<Homepage />)
            await act(async () => { await vi.advanceTimersByTimeAsync(2900) })
            expect(createHomeScene).not.toHaveBeenCalled()
            await act(async () => { await vi.advanceTimersByTimeAsync(200) })
            vi.useRealTimers()
            await waitFor(() => expect(createHomeScene).toHaveBeenCalled())
        } finally {
            vi.useRealTimers()
            delete (Element.prototype as Partial<Element>).getAnimations
        }
    })

    it("carries on without the scene when it fails to start", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        createHomeScene.mockImplementation(() => { throw new Error("no GPU") })
        render(<Homepage />)
        await waitFor(() => expect(error).toHaveBeenCalledWith("Couldn't start the 3D scene: ", expect.any(Error)))
        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
    })

    it("scrolls to each section from the header", async () => {
        render(<Homepage />)
        const sections = screen.getByRole("navigation", { name: "Sections" })
        for (const name of ["Product", "Features", "The app", "Privacy"]) {
            await user.click(within(sections).getByRole("button", { name }))
        }
        await user.click(screen.getByRole("button", { name: "Scroll" }))
        await user.click(screen.getAllByRole("link", { name: "ProgressX" })[0])
        expect(scrollTo).toHaveBeenCalledTimes(6)
        expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" })
    })

    it("tilts the feature cards and pulls the buttons toward the pointer", () => {
        render(<Homepage />)
        const card = screen.getByRole("heading", { name: "One score for the whole day" }).parentElement!
        fireEvent.mouseMove(card, { clientX: 10, clientY: 10 })
        expect(card.style.getPropertyValue("--rx")).not.toBe("")
        fireEvent.mouseLeave(card)
        expect(card.style.getPropertyValue("--rx")).toBe("0deg")

        const magnet = screen.getByRole("link", { name: "Start for free" }).parentElement!
        fireEvent.mouseMove(magnet, { clientX: 10, clientY: 10 })
        expect(magnet.style.getPropertyValue("--tx")).not.toBe("")
        fireEvent.mouseLeave(magnet)
        expect(magnet.style.getPropertyValue("--tx")).toBe("0px")
    })
})
