"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ForYouFeed.module.css";
import { ArrowIcon } from "./icons";
import { AdContext, AdPost, adPost, adTagFor, Ima, ImaAdDisplayContainer, ImaAdsLoader, ImaAdsManager, loadIma } from "./ima";

// How long a reached slot waits for its ad before it's skipped (no ad available, slow network)
const FILL_TIMEOUT_MS = 4000
const PROGRESS_EVERY_MS = 250

export type AdOutcome = "completed" | "unfilled"

type AdSlotProps = {
    tagUrl: string,
    context: AdContext,   // personalized or not, and the fitness topics around the slot
    active: boolean,   // the slot is on screen: play the ad
    muted: boolean,
    onStarted: () => void,
    onDone: (outcome: AdOutcome) => void,   // the slot can be taken out of the feed
}

// One Google video ad, shown like a post in the feed (TikTok-style): full screen, with the advertiser's
// name, a "Sponsored" tag, its caption and a "Learn more" button, instead of Google's standard player
// controls. Mounted a few slots early so its ad is requested and ready by the time it's reached (it only
// plays while active). When it finishes, is skipped, or no ad comes, onDone.
export default function AdSlot({ tagUrl, context, active, muted, onStarted, onDone }: AdSlotProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const ctaRef = useRef<HTMLButtonElement>(null)
    const manager = useRef<ImaAdsManager | null>(null)
    const ima = useRef<Ima | null>(null)
    const duration = useRef(0)
    const started = useRef(false)
    const finished = useRef(false)
    const [ ready, setReady ] = useState(false)
    const [ post, setPost ] = useState<AdPost | null>(null)
    const [ progress, setProgress ] = useState(0)
    const [ pausedByClick, setPausedByClick ] = useState(false)
    // latest props for the SDK's callbacks
    const latest = useRef({ context, active, muted, onStarted, onDone })
    useEffect(() => { latest.current = { context, active, muted, onStarted, onDone } })

    const finish = (outcome: AdOutcome) => {
        if (finished.current) return
        finished.current = true
        latest.current.onDone(outcome)
    }

    // request the ad as soon as the slot is mounted (a few videos early)
    useEffect(() => {
        let display: ImaAdDisplayContainer | null = null
        let loader: ImaAdsLoader | null = null
        let cancelled = false

        loadIma().then((sdk) => {
            const container = containerRef.current, video = videoRef.current, cta = ctaRef.current
            if (cancelled || !container || !video || !cta) return
            ima.current = sdk
            // pressing "Learn more" opens the ad's link through Google, which counts the click
            display = new sdk.AdDisplayContainer(container, video, cta)
            display.initialize()
            loader = new sdk.AdsLoader(display)
            loader.addEventListener(sdk.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event) => {
                const settings = new sdk.AdsRenderingSettings()
                settings.uiElements = [] // no standard player controls: the post layout is drawn here
                settings.restoreCustomPlaybackStateOnAdBreakComplete = false
                const ads = event.getAdsManager?.(video, settings)
                if (!ads || cancelled) return
                manager.current = ads
                ads.addEventListener(sdk.AdErrorEvent.Type.AD_ERROR, () => finish(started.current ? "completed" : "unfilled"))
                ads.addEventListener(sdk.AdEvent.Type.LOADED, (e) => {
                    const ad = e.getAd?.() ?? null
                    duration.current = ad?.getDuration() ?? 0
                    setPost(adPost(ad))
                })
                ads.addEventListener(sdk.AdEvent.Type.STARTED, () => {
                    started.current = true
                    latest.current.onStarted()
                })
                // Google pauses the ad while its link is open; tapping the ad plays it again
                ads.addEventListener(sdk.AdEvent.Type.CLICK, () => setPausedByClick(true))
                for (const type of [sdk.AdEvent.Type.ALL_ADS_COMPLETED, sdk.AdEvent.Type.SKIPPED, sdk.AdEvent.Type.USER_CLOSE]) {
                    ads.addEventListener(type, () => finish("completed"))
                }
                setReady(true)
            })
            loader.addEventListener(sdk.AdErrorEvent.Type.AD_ERROR, () => finish("unfilled"))

            const request = new sdk.AdsRequest()
            request.adTagUrl = adTagFor(tagUrl, `${window.location.origin}/`, latest.current.context)
            request.linearAdSlotWidth = container.clientWidth
            request.linearAdSlotHeight = container.clientHeight
            request.nonLinearAdSlotWidth = container.clientWidth
            request.nonLinearAdSlotHeight = Math.round(container.clientHeight / 3)
            request.setAdWillAutoPlay(true)
            request.setAdWillPlayMuted(latest.current.muted)
            loader.requestAds(request)
        }).catch(() => finish("unfilled")) // blocked by an ad blocker, or offline

        return () => {
            cancelled = true
            manager.current?.destroy()
            manager.current = null
            loader?.destroy()
            display?.destroy()
        }
    }, [tagUrl])

    // play while on screen, pause when scrolled away (coming back resumes it)
    useEffect(() => {
        const ads = manager.current, sdk = ima.current, container = containerRef.current
        if (!ready || !ads || !sdk || !container) return
        if (!active) {
            if (started.current) ads.pause()
            return
        }
        if (started.current) {
            ads.resume()
            setPausedByClick(false)
        } else {
            ads.init(container.clientWidth, container.clientHeight, sdk.ViewMode.NORMAL)
            ads.setVolume(latest.current.muted ? 0 : 1)
            ads.start()
        }
    }, [active, ready])

    // a slot that's reached but has no ad within a few seconds is skipped rather than shown blank
    useEffect(() => {
        if (!active || started.current) return
        const timer = setTimeout(() => { if (!started.current) finish("unfilled") }, FILL_TIMEOUT_MS)
        return () => clearTimeout(timer)
    }, [active])

    // the progress bar along the bottom, like a normal video's
    useEffect(() => {
        if (!active || !ready) return
        const timer = setInterval(() => {
            const total = duration.current, left = manager.current?.getRemainingTime() ?? -1
            if (started.current && total > 0 && left >= 0) setProgress(Math.min(1, Math.max(0, 1 - left / total)))
        }, PROGRESS_EVERY_MS)
        return () => clearInterval(timer)
    }, [active, ready])

    useEffect(() => { manager.current?.setVolume(muted ? 0 : 1) }, [muted])

    useEffect(() => {
        const container = containerRef.current
        if (!container || typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(() => {
            if (started.current && ima.current) manager.current?.resize(container.clientWidth, container.clientHeight, ima.current.ViewMode.NORMAL)
        })
        observer.observe(container)
        return () => observer.disconnect()
    }, [])

    return (
        <div className={styles.adSlot}>
            <div ref={containerRef} className={styles.adContainer}>
                <video ref={videoRef} className={styles.video} playsInline muted={muted} aria-label={post ? `Sponsored video from ${post.advertiser}` : "Sponsored video"} />
            </div>

            {pausedByClick ?
                <button type="button" className={styles.tapLayer} onClick={() => { manager.current?.resume(); setPausedByClick(false) }} aria-label="Play">
                    <span className={styles.playBadge} aria-hidden="true"><ArrowIcon size={44} /></span>
                </button>
            : null}

            <div className={`${styles.details} ${styles.adDetails} ${post ? "" : styles.adWaiting}`}>
                <div className={styles.adAdvertiser}>
                    <span className={styles.adAvatar} aria-hidden="true">{post?.advertiser.charAt(0).toUpperCase()}</span>
                    <span className={styles.author}>{post?.advertiser}</span>
                </div>
                {post?.caption ? <p className={styles.caption}>{post.caption}</p> : null}
                <span className={styles.sponsored}>Sponsored</span>
                {/* Google opens the ad's link when this is pressed, and counts the click */}
                <button ref={ctaRef} type="button" className={styles.adCta}>
                    Learn more <ArrowIcon size={14} />
                </button>
            </div>
            <div className={styles.progress} aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
        </div>
    )
}
