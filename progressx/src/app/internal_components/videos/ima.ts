// Google's Interactive Media Ads (IMA) SDK, which requests, plays and measures the video ads in the feed
// (VAST / VMAP tags from Google Ad Manager or AdSense for video). Loaded only when ads are switched on,
// the first time an ad slot comes near. Only the parts of its API the feed uses are typed here.

const SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js"

// The ad being played: what the feed shows around it so it looks like a post
export type ImaAd = {
    getAdvertiserName(): string
    getTitle(): string
    getDescription(): string
    getDuration(): number
}

type Listener = (event: ImaEvent) => void
type ImaEvent = {
    getAd?: () => ImaAd | null
    getError?: () => { getMessage(): string }
    getAdsManager?: (playback: HTMLVideoElement, settings?: ImaRenderingSettings) => ImaAdsManager
}

export type ImaAdsManager = {
    addEventListener(type: string, listener: Listener): void
    init(width: number, height: number, viewMode: unknown): void
    start(): void
    pause(): void
    resume(): void
    resize(width: number, height: number, viewMode: unknown): void
    setVolume(volume: number): void
    getRemainingTime(): number
    destroy(): void
}

export type ImaAdsLoader = {
    addEventListener(type: string, listener: Listener): void
    requestAds(request: unknown): void
    destroy(): void
}

export type ImaAdDisplayContainer = { initialize(): void, destroy(): void }

export type ImaRenderingSettings = {
    uiElements: string[] | null
    restoreCustomPlaybackStateOnAdBreakComplete: boolean
}

export type Ima = {
    // clickTarget: our own element that opens the ad's link (and counts the click) when pressed
    AdDisplayContainer: new (container: HTMLElement, video: HTMLVideoElement, clickTarget?: HTMLElement) => ImaAdDisplayContainer
    AdsLoader: new (container: ImaAdDisplayContainer) => ImaAdsLoader
    AdsRenderingSettings: new () => ImaRenderingSettings
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
    AdEvent: { Type: { LOADED: string, STARTED: string, COMPLETE: string, SKIPPED: string, ALL_ADS_COMPLETED: string, USER_CLOSE: string, CLICK: string } }
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

export type AdContext = {
    personalized: boolean,  // the user opted in to personalized ads (Settings); otherwise npa=1
    topics: string[],       // fitness topics of the videos around the ad (contextual, not about the user)
}

// The ad tag with what Google needs per request: a fresh correlator (one value per page view and ad),
// non-personalized ads (npa=1) unless the user opted in, the page it's on, and contextual key-values
// (category=fitness and the topics nearby) so fitness advertisers can bid on the slot
export function adTagFor(tagUrl: string, pageUrl: string, context: AdContext, now = Date.now()): string {
    const url = new URL(tagUrl)
    url.searchParams.set("correlator", String(now))
    if (context.personalized) url.searchParams.delete("npa")
    else url.searchParams.set("npa", "1")
    if (!url.searchParams.has("description_url")) url.searchParams.set("description_url", pageUrl)
    if (!url.searchParams.has("url")) url.searchParams.set("url", pageUrl)
    const values = [url.searchParams.get("cust_params"), "category=fitness", context.topics.length ? `topic=${context.topics.join(",")}` : ""]
    url.searchParams.set("cust_params", values.filter(Boolean).join("&"))
    return url.toString()
}

export type AdPost = { advertiser: string, caption: string }

// How an ad is shown as a post: who it's from and its caption. Video ads don't always name the
// advertiser, so the ad's title stands in, and the caption is left out when it would only repeat it.
export function adPost(ad: Pick<ImaAd, "getAdvertiserName" | "getTitle" | "getDescription"> | null): AdPost {
    const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim()
    const name = clean(ad?.getAdvertiserName()), title = clean(ad?.getTitle()), description = clean(ad?.getDescription())
    const advertiser = name || title || "Sponsored"
    const captionParts = [title !== advertiser ? title : "", description].filter((part, i, all) => part && all.indexOf(part) === i)
    return { advertiser: advertiser.slice(0, 60), caption: captionParts.join(" · ").slice(0, 300) }
}
