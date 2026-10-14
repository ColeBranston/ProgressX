// Google's Interactive Media Ads (IMA) SDK, which requests, plays and measures the video ads in the feed
// (VAST / VMAP tags from Google Ad Manager or AdSense for video). Loaded only when ads are switched on,
// the first time an ad slot comes near. Only the parts of its API the feed uses are typed here.

const SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js"

type Listener = (event: ImaEvent) => void
type ImaEvent = { getError?: () => { getMessage(): string }, getAdsManager?: (playback: HTMLVideoElement) => ImaAdsManager }

export type ImaAdsManager = {
    addEventListener(type: string, listener: Listener): void
    init(width: number, height: number, viewMode: unknown): void
    start(): void
    pause(): void
    resume(): void
    resize(width: number, height: number, viewMode: unknown): void
    setVolume(volume: number): void
    destroy(): void
}

export type ImaAdsLoader = {
    addEventListener(type: string, listener: Listener): void
    requestAds(request: unknown): void
    destroy(): void
}

export type ImaAdDisplayContainer = { initialize(): void, destroy(): void }

export type Ima = {
    AdDisplayContainer: new (container: HTMLElement, video: HTMLVideoElement) => ImaAdDisplayContainer
    AdsLoader: new (container: ImaAdDisplayContainer) => ImaAdsLoader
    AdsRequest: new () => {
        adTagUrl: string
        linearAdSlotWidth: number
        linearAdSlotHeight: number
        nonLinearAdSlotWidth: number
        nonLinearAdSlotHeight: number
        setAdWillAutoPlay(autoPlay: boolean): void
        setAdWillPlayMuted(muted: boolean): void
    }
    AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } }
    AdErrorEvent: { Type: { AD_ERROR: string } }
    AdEvent: { Type: { STARTED: string, COMPLETE: string, SKIPPED: string, ALL_ADS_COMPLETED: string, USER_CLOSE: string } }
    ViewMode: { NORMAL: unknown }
}

declare global {
    interface Window { google?: { ima?: Ima } }
}

let loading: Promise<Ima> | null = null

// Loads the SDK once; rejects (and lets a later call try again) if it can't load, e.g. an ad blocker
export function loadIma(): Promise<Ima> {
    if (typeof window === "undefined") return Promise.reject(new Error("no window"))
    if (window.google?.ima) return Promise.resolve(window.google.ima)
    loading ??= new Promise<Ima>((resolve, reject) => {
        const script = document.createElement("script")
        script.src = SDK_URL
        script.async = true
        script.onload = () => window.google?.ima ? resolve(window.google.ima) : reject(new Error("IMA didn't load"))
        script.onerror = () => reject(new Error("IMA blocked or unreachable"))
        document.head.appendChild(script)
    }).catch((err) => {
        loading = null
        throw err
    })
    return loading
}

// The ad tag with what Google needs per request: a fresh correlator (one value per page view and ad),
// non-personalized ads only (npa=1: no ad profiling, as the privacy policy says), and the page it's on
export function adTagFor(tagUrl: string, pageUrl: string, now = Date.now()): string {
    const url = new URL(tagUrl)
    url.searchParams.set("correlator", String(now))
    url.searchParams.set("npa", "1")
    if (!url.searchParams.has("description_url")) url.searchParams.set("description_url", pageUrl)
    if (!url.searchParams.has("url")) url.searchParams.set("url", pageUrl)
    return url.toString()
}
