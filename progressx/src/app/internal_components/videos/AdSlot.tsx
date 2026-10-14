"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ForYouFeed.module.css";
import { adTagFor, Ima, ImaAdDisplayContainer, ImaAdsLoader, ImaAdsManager, loadIma } from "./ima";

// How long a reached slot waits for its ad before it's skipped (no ad available, slow network)
const FILL_TIMEOUT_MS = 4000

export type AdOutcome = "completed" | "unfilled"

type AdSlotProps = {
    tagUrl: string,
    active: boolean,   // the slot is on screen: play the ad
    muted: boolean,
    onStarted: () => void,
    onDone: (outcome: AdOutcome) => void,   // the slot can be taken out of the feed
}

// One video ad between feed videos. Mounted a few slots early so its ad is requested and ready by the
// time it's reached (it only plays while active). When it finishes, is skipped, or no ad comes, onDone.
export default function AdSlot({ tagUrl, active, muted, onStarted, onDone }: AdSlotProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const manager = useRef<ImaAdsManager | null>(null)
    const ima = useRef<Ima | null>(null)
    const started = useRef(false)
    const finished = useRef(false)
    const [ ready, setReady ] = useState(false)
    // latest props for the SDK's callbacks
    const latest = useRef({ active, muted, onStarted, onDone })
    useEffect(() => { latest.current = { active, muted, onStarted, onDone } })

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
            const container = containerRef.current, video = videoRef.current
            if (cancelled || !container || !video) return
            ima.current = sdk
            display = new sdk.AdDisplayContainer(container, video)
            display.initialize()
            loader = new sdk.AdsLoader(display)
            loader.addEventListener(sdk.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event) => {
                const ads = event.getAdsManager?.(video)
                if (!ads || cancelled) return
                manager.current = ads
                ads.addEventListener(sdk.AdErrorEvent.Type.AD_ERROR, () => finish(started.current ? "completed" : "unfilled"))
                ads.addEventListener(sdk.AdEvent.Type.STARTED, () => {
                    started.current = true
                    latest.current.onStarted()
                })
                for (const type of [sdk.AdEvent.Type.ALL_ADS_COMPLETED, sdk.AdEvent.Type.SKIPPED, sdk.AdEvent.Type.USER_CLOSE]) {
                    ads.addEventListener(type, () => finish("completed"))
                }
                setReady(true)
            })
            loader.addEventListener(sdk.AdErrorEvent.Type.AD_ERROR, () => finish("unfilled"))

            const request = new sdk.AdsRequest()
            request.adTagUrl = adTagFor(tagUrl, `${window.location.origin}/`)
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
                <video ref={videoRef} className={styles.video} playsInline muted={muted} aria-label="Advertisement" />
            </div>
            <span className={styles.sponsored}>Sponsored</span>
        </div>
    )
}
