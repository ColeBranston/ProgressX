// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AdSlot from "@/app/internal_components/videos/AdSlot"
import { adPost } from "@/app/internal_components/videos/ima"

type Handler = (event: Record<string, unknown>) => void

// A stand-in for Google's IMA SDK: records what the slot asks of it and lets the test fire its events
function fakeIma(ad = { advertiser: "Acme Protein", title: "Acme Whey", description: "30g protein per scoop", duration: 15 }) {
    const managerHandlers = new Map<string, Handler>()
    const loaderHandlers = new Map<string, Handler>()
    const calls: string[] = []
    let clickTarget: HTMLElement | undefined
    let rendering: { uiElements: string[] | null } | undefined
    const manager = {
        addEventListener: (type: string, fn: Handler) => managerHandlers.set(type, fn),
        init: () => calls.push("init"), start: () => calls.push("start"), pause: () => calls.push("pause"), resume: () => calls.push("resume"),
        resize: () => {}, setVolume: (v: number) => calls.push(`volume ${v}`), getRemainingTime: () => 5, destroy: () => calls.push("destroy"),
    }
    const ima = {
        AdDisplayContainer: class { constructor(_c: HTMLElement, _v: HTMLVideoElement, target?: HTMLElement) { clickTarget = target } initialize() {} destroy() {} },
        AdsLoader: class {
            addEventListener(type: string, fn: Handler) { loaderHandlers.set(type, fn) }
            requestAds() { calls.push("request") }
            destroy() {}
        },
        AdsRenderingSettings: class { uiElements: string[] | null = null; restoreCustomPlaybackStateOnAdBreakComplete = true },
        AdsRequest: class { adTagUrl = ""; linearAdSlotWidth = 0; linearAdSlotHeight = 0; nonLinearAdSlotWidth = 0; nonLinearAdSlotHeight = 0; setAdWillAutoPlay() {} setAdWillPlayMuted() {} },
        AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: "loaded-manager" } },
        AdErrorEvent: { Type: { AD_ERROR: "error" } },
        AdEvent: { Type: { LOADED: "loaded", STARTED: "started", COMPLETE: "complete", SKIPPED: "skipped", ALL_ADS_COMPLETED: "all-done", USER_CLOSE: "close", CLICK: "click" } },
        ViewMode: { NORMAL: "normal" },
    }
    window.google = { ima: ima as never }
    return {
        calls,
        clickTarget: () => clickTarget,
        rendering: () => rendering,
        // Google answers the ad request
        fill: () => act(() => {
            loaderHandlers.get("loaded-manager")!({
                getAdsManager: (_video: HTMLVideoElement, settings: { uiElements: string[] | null }) => { rendering = settings; return manager },
            })
        }),
        noAd: () => act(() => loaderHandlers.get("error")!({})),
        fire: (type: string) => act(() => managerHandlers.get(type)!({
            getAd: () => ({ getAdvertiserName: () => ad.advertiser, getTitle: () => ad.title, getDescription: () => ad.description, getDuration: () => ad.duration }),
        })),
    }
}

const context = { personalized: false, topics: ["strength"] }

beforeEach(() => { delete window.google })
afterEach(() => { delete window.google })

describe("AdSlot", () => {
    it("shows the ad as a post, with Learn more as Google's click target and no standard controls", async () => {
        const sdk = fakeIma()
        const onStarted = vi.fn(), onDone = vi.fn()
        render(<AdSlot tagUrl="https://ads.example/tag" context={context} active muted onStarted={onStarted} onDone={onDone} />)
        await waitFor(() => expect(sdk.calls).toContain("request"))

        sdk.fill()
        sdk.fire("loaded")
        expect(screen.getByText("Acme Protein")).toBeVisible()
        expect(screen.getByText("Acme Whey · 30g protein per scoop")).toBeVisible()
        expect(screen.getByText("Sponsored")).toBeVisible()
        expect(sdk.clickTarget()).toBe(screen.getByRole("button", { name: "Learn more" }))
        expect(sdk.rendering()?.uiElements).toEqual([])
        await waitFor(() => expect(sdk.calls).toEqual(expect.arrayContaining(["init", "volume 0", "start"])))

        sdk.fire("started")
        expect(onStarted).toHaveBeenCalled()
        sdk.fire("all-done")
        expect(onDone).toHaveBeenCalledWith("completed")
    })

    it("waits to play until it's on screen, and pauses when scrolled away", async () => {
        const sdk = fakeIma()
        const props = { tagUrl: "https://ads.example/tag", context, muted: true, onStarted: () => {}, onDone: () => {} }
        const { rerender } = render(<AdSlot {...props} active={false} />)
        await waitFor(() => expect(sdk.calls).toContain("request"))
        sdk.fill()
        expect(sdk.calls).not.toContain("start")

        rerender(<AdSlot {...props} active />)
        await waitFor(() => expect(sdk.calls).toContain("start"))
        sdk.fire("started")
        rerender(<AdSlot {...props} active={false} />)
        await waitFor(() => expect(sdk.calls).toContain("pause"))
    })

    it("gives up when Google has no ad", async () => {
        const sdk = fakeIma()
        const onDone = vi.fn()
        render(<AdSlot tagUrl="https://ads.example/tag" context={context} active muted onStarted={() => {}} onDone={onDone} />)
        await waitFor(() => expect(sdk.calls).toContain("request"))
        sdk.noAd()
        expect(onDone).toHaveBeenCalledWith("unfilled")
    })

    it("gives up when the ad SDK is blocked", async () => {
        const append = vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
            queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event("error")))
            return node
        })
        const onDone = vi.fn()
        render(<AdSlot tagUrl="https://ads.example/tag" context={context} active={false} muted onStarted={() => {}} onDone={onDone} />)
        await waitFor(() => expect(onDone).toHaveBeenCalledWith("unfilled"))
        append.mockRestore()
    })
})

describe("adPost", () => {
    const ad = (advertiser: string, title: string, description: string) => ({ getAdvertiserName: () => advertiser, getTitle: () => title, getDescription: () => description })

    it("uses the advertiser's name, falling back to the ad's title", () => {
        expect(adPost(ad("Acme", "Acme Whey", "30g protein"))).toEqual({ advertiser: "Acme", caption: "Acme Whey · 30g protein" })
        expect(adPost(ad("", "Acme Whey", "30g protein"))).toEqual({ advertiser: "Acme Whey", caption: "30g protein" })
        expect(adPost(ad("", "", ""))).toEqual({ advertiser: "Sponsored", caption: "" })
        expect(adPost(null)).toEqual({ advertiser: "Sponsored", caption: "" })
    })

    it("doesn't repeat itself and tidies whitespace", () => {
        expect(adPost(ad("Acme", "Acme", "  Big\n  sale "))).toEqual({ advertiser: "Acme", caption: "Big sale" })
        expect(adPost(ad("Acme", "Same", "Same"))).toEqual({ advertiser: "Acme", caption: "Same" })
    })
})
