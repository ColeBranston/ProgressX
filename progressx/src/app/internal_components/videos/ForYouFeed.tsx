"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./ForYouFeed.module.css";
import VideoPlayer from "./VideoPlayer";
import AdSlot from "./AdSlot";
import { ArrowIcon, BookmarkIcon, CommentIcon, HeartIcon, MoreIcon, MutedIcon, ShareIcon, VolumeIcon } from "./icons";
import { Reaction, VideoCard, formatCount, setFollow, setReaction } from "./videoTypes";
import { AdConfig, FeedItem, adAllowedNow, appendWithAds, loadedRange, needsMore } from "./feedPlan";

const NAV_COOLDOWN_MS = 550
const SWIPE_PX = 50
// ad slots are mounted (and their ad requested) this many items before they're reached
const AD_REQUEST_AHEAD = 2
// how many recently shown videos the For You feed asks the server not to repeat
const SEEN_SENT = 100

type Feed = { items: FeedItem[], index: number, nextKey: number }
type FeedAction =
    | { type: "append", videos: VideoCard[], ads: AdConfig | null, dedupe: boolean }
    | { type: "go", to: number, removeKey?: string }
    | { type: "remove", key: string }
    | { type: "updateVideos", update: (video: VideoCard) => VideoCard }

// The feed's items and position change together, so taking an ad out never leaves the position
// pointing at the wrong item
export function feedReducer(feed: Feed, action: FeedAction): Feed {
    switch (action.type) {
        case "append": {
            const have = new Set(action.dedupe ? feed.items.flatMap((item) => item.kind === "video" ? [item.video.id] : []) : [])
            let nextKey = feed.nextKey
            const items = appendWithAds(feed.items, action.videos.filter((v) => !have.has(v.id)), action.ads, () => `item-${nextKey++}`)
            return { ...feed, items, nextKey }
        }
        case "go": {
            if (!action.removeKey) return { ...feed, index: action.to }
            // stepping onto an ad that isn't allowed yet: take it out and land on the item past it
            const items = feed.items.filter((item) => item.key !== action.removeKey)
            const landing = action.to > feed.index ? action.to : action.to - 1
            return { ...feed, items, index: Math.max(0, Math.min(items.length - 1, landing)) }
        }
        case "remove": {
            const at = feed.items.findIndex((item) => item.key === action.key)
            if (at === -1) return feed
            const items = [...feed.items.slice(0, at), ...feed.items.slice(at + 1)]
            // removing the current item brings the next one into place
            const index = at < feed.index ? feed.index - 1 : feed.index
            return { ...feed, items, index: Math.max(0, Math.min(items.length - 1, index)) }
        }
        case "updateVideos":
            return { ...feed, items: feed.items.map((item) => item.kind === "video" ? { ...item, video: action.update(item.video) } : item) }
    }
}

// The For You feed (random public videos) or the Following feed (newest videos from people you
// follow): one video at a time, with video ads between them when ads are switched on. Up / down
// arrows, the mouse wheel, arrow keys or a swipe move between items; tapping a video pauses it. Only
// 10 items are loaded at once (see feedPlan.ts): the 5 ahead are ready to play, ones far behind are
// unloaded and load again if you scroll back.
export default function ForYouFeed({ source = "for-you" }: { source?: "for-you" | "following" }) {
    const start = useSearchParams().get("v")
    const [ followsAnyone, setFollowsAnyone ] = useState(true)
    const [ { items, index }, dispatch ] = useReducer(feedReducer, { items: [], index: 0, nextKey: 0 })
    const [ ads, setAds ] = useState<AdConfig | null>(null)
    const [ cursor, setCursor ] = useState<string | null>(null)
    const [ exhausted, setExhausted ] = useState(false)
    const [ state, setState ] = useState<"loading" | "ready" | "error">("loading")
    const [ muted, setMuted ] = useState(true)
    const [ paused, setPaused ] = useState(false)
    const [ progress, setProgress ] = useState(0)
    const [ failed, setFailed ] = useState<Set<string>>(new Set())
    const [ menuOpen, setMenuOpen ] = useState(false)
    const [ toast, setToast ] = useState<string | null>(null)
    const loadingMore = useRef(false)
    const lastNav = useRef(0)
    const touchY = useRef<number | null>(null)
    const activeVideo = useRef<HTMLVideoElement | null>(null)
    const lastAdShownAt = useRef<number | null>(null)
    // the latest items and cursor, for fetches started from effects
    const latest = useRef({ items, cursor })
    useEffect(() => { latest.current = { items, cursor } }, [items, cursor])

    const load = useCallback(async (initial: boolean) => {
        if (loadingMore.current) return
        loadingMore.current = true
        try {
            let query: URLSearchParams
            if (source === "following") {
                const next = latest.current.cursor
                query = new URLSearchParams(!initial && next ? { cursor: next } : {})
            } else {
                // newest first, so the server avoids repeating what was just shown
                const shown = latest.current.items.flatMap((item) => item.kind === "video" ? [item.video.id] : []).reverse()
                query = new URLSearchParams({ seen: [...new Set(shown)].slice(0, SEEN_SENT).join(",") })
                if (initial && start) query.set("start", start)
            }
            const res = await fetch(`${source === "following" ? "/api/videos/following" : "/api/videos/feed"}?${query}`)
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            const batch = (json.videos ?? []) as VideoCard[]
            const adSettings = (json.ads ?? null) as AdConfig | null
            setAds(adSettings)
            dispatch({ type: "append", videos: batch, ads: adSettings, dedupe: source === "following" })
            if (source === "following") {
                setCursor(json.nextCursor ?? null)
                if (!json.nextCursor) setExhausted(true)
            } else if (!batch.length) {
                setExhausted(true)
            }
            if (json.followsAnyone === false) setFollowsAnyone(false)
            setState("ready")
        } catch (e) {
            console.error("Failed to load the feed: ", e)
            if (initial) setState("error")
        } finally {
            loadingMore.current = false
        }
    }, [start, source])

    useEffect(() => { load(true) }, [load])

    // keep 5 items queued after the current one
    useEffect(() => {
        if (state === "ready" && !exhausted && needsMore(index, items.length)) load(false)
    }, [index, items.length, exhausted, state, load])

    const go = useCallback((delta: number) => {
        const now = Date.now()
        if (now - lastNav.current < NAV_COOLDOWN_MS) return
        lastNav.current = now
        const to = Math.max(0, Math.min(items.length - 1, index + delta))
        if (to === index) return
        setPaused(false)
        setProgress(0)
        setMenuOpen(false)
        const target = items[to]
        const skipAd = target.kind === "ad" && (!ads || !adAllowedNow(ads, lastAdShownAt.current))
        dispatch({ type: "go", to, removeKey: skipAd ? target.key : undefined })
    }, [items, index, ads])

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null
            if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return
            if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); go(1) }
            else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); go(-1) }
            else if (e.key === "m") setMuted((m) => !m)
            else if (e.key === "Escape") setMenuOpen(false)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [go])

    useEffect(() => {
        if (!toast) return
        const timer = setTimeout(() => setToast(null), 2200)
        return () => clearTimeout(timer)
    }, [toast])

    const current = items[index]
    const currentVideo = current?.kind === "video" ? current.video : null

    async function toggle(video: VideoCard, reaction: Reaction) {
        const on = reaction === "like" ? !video.liked : !video.favourited
        const optimistic = reaction === "like"
            ? { liked: on, likes: Math.max(0, video.likes + (on ? 1 : -1)) }
            : { favourited: on, favourites: Math.max(0, video.favourites + (on ? 1 : -1)) }
        const update = (patch: Partial<VideoCard>) => dispatch({ type: "updateVideos", update: (v) => (v.id === video.id ? { ...v, ...patch } : v) })
        update(optimistic)
        try {
            update(await setReaction(video.id, reaction, on))
        } catch (e) {
            update({ liked: video.liked, likes: video.likes, favourited: video.favourited, favourites: video.favourites })
            setToast(e instanceof Error ? e.message : "Couldn't save that")
        }
    }

    async function share(video: VideoCard) {
        const url = `${window.location.origin}/?v=${video.id}`
        setMenuOpen(false)
        try {
            if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
                await navigator.share({ url, title: `@${video.author.username} on ProgressX` })
            } else {
                await navigator.clipboard.writeText(url)
                setToast("Link copied")
            }
        } catch { /* share sheet closed */ }
    }

    // tap to pause / play; if the browser blocked autoplay, the first tap starts the video
    function togglePlay() {
        const video = activeVideo.current
        if (video && video.paused && !paused) {
            video.play().catch(() => {})
            return
        }
        setPaused((p) => !p)
    }

    // the "+" under the poster's picture: follow them (every video of theirs in the feed updates)
    async function follow(video: VideoCard) {
        const update = (following: boolean) => dispatch({ type: "updateVideos", update: (v) => (v.author.username === video.author.username ? { ...v, author: { ...v.author, following } } : v) })
        update(true)
        try {
            const result = await setFollow(video.author.username, true)
            update(result.following)
            setToast(`Following @${video.author.username}`)
        } catch (e) {
            update(false)
            setToast(e instanceof Error ? e.message : "Couldn't follow them")
        }
    }

    const markFailed = useCallback((id: string) => setFailed((prev) => new Set(prev).add(id)), [])
    const adStarted = useCallback(() => { lastAdShownAt.current = Date.now() }, [])
    // a finished, skipped or unfilled ad leaves the feed; if it was on screen, the next video slides in
    const adDone = useCallback((key: string) => dispatch({ type: "remove", key }), [])

    if (state === "loading") {
        return <div className={styles.feed}><div className={styles.player}><span className={styles.spinner} role="status" aria-label="Loading videos" /></div></div>
    }

    if (state === "error" || !current) {
        return (
            <div className={styles.feed}>
                <div className={`${styles.player} ${styles.message}`}>
                    {state === "error" ?
                        <>
                            <p className={styles.messageTitle}>Couldn&apos;t load videos</p>
                            <button type="button" className={styles.messageButton} onClick={() => { setState("loading"); load(true) }}>Try again</button>
                        </>
                    :
                        <>
                            {source === "following" ?
                                <>
                                    <p className={styles.messageTitle}>{followsAnyone ? "Nothing new yet" : "You're not following anyone"}</p>
                                    <p className={styles.messageText}>
                                        {followsAnyone
                                            ? "Videos from the people you follow show up here. The people you follow haven't posted public videos yet."
                                            : "Follow people from their profile or the For You feed, and their videos show up here."}
                                    </p>
                                    <Link href="/" className={styles.messageButton}>Go to For You</Link>
                                </>
                            :
                                <>
                                    <p className={styles.messageTitle}>No videos yet</p>
                                    <p className={styles.messageText}>Videos from public profiles show up here. Be the first to post one.</p>
                                    <Link href="/profile?videoSubmit=true" className={styles.messageButton}>Post a video</Link>
                                </>
                            }
                        </>
                    }
                </div>
            </div>
        )
    }

    const [ first, last ] = loadedRange(index, items.length)
    const profileHref = (video: VideoCard) => video.isOwner ? "/profile" : `/profile/${encodeURIComponent(video.author.username)}`

    return (
        <div className={styles.feed}>
            <div
                className={styles.player}
                onWheel={(e) => { if (Math.abs(e.deltaY) > 25) go(e.deltaY > 0 ? 1 : -1) }}
                onTouchStart={(e) => { touchY.current = e.touches[0].clientY }}
                onTouchEnd={(e) => {
                    if (touchY.current === null) return
                    const dy = touchY.current - e.changedTouches[0].clientY
                    touchY.current = null
                    if (Math.abs(dy) > SWIPE_PX) go(dy > 0 ? 1 : -1)
                }}
                aria-roledescription="video feed"
                aria-label={currentVideo ? `Video ${index + 1} of ${items.length}${exhausted ? "" : "+"}` : "Sponsored video"}
            >
                {items.slice(first, last + 1).map((item, offset) => {
                    const i = first + offset
                    const ahead = i - index
                    return (
                        <div key={item.key} className={styles.slide} style={{ transform: `translateY(${ahead * 100}%)` }} aria-hidden={i !== index}>
                            {item.kind === "ad" ?
                                ads && ahead <= AD_REQUEST_AHEAD ?
                                    <AdSlot
                                        tagUrl={ads.tagUrl}
                                        active={i === index}
                                        muted={muted}
                                        onStarted={adStarted}
                                        onDone={() => adDone(item.key)}
                                    />
                                : null
                            : item.video.playback && !failed.has(item.video.id) ?
                                <VideoPlayer
                                    ref={i === index ? activeVideo : undefined}
                                    playback={item.video.playback}
                                    active={i === index && !paused}
                                    // the 5 ahead load now so the next swipes are instant; ones behind keep what they have
                                    preload={i === index || ahead > 0 ? "auto" : "none"}
                                    muted={muted}
                                    className={styles.video}
                                    label={item.video.caption || `Video by @${item.video.author.username}`}
                                    onProgress={i === index ? setProgress : undefined}
                                    onError={() => markFailed(item.video.id)}
                                />
                            :   <p className={styles.unavailable}>This video can&apos;t be played right now</p>}
                        </div>
                    )
                })}

                {currentVideo ?
                    <button type="button" className={styles.tapLayer} onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}>
                        {paused ? <span className={styles.playBadge} aria-hidden="true"><ArrowIcon size={44} /></span> : null}
                    </button>
                :
                    // the ad's own controls handle taps; this lets phones move on, since swipes over the ad go to the ad
                    <button type="button" className={styles.adNext} onClick={() => go(1)} disabled={index >= items.length - 1}>
                        Next video <ArrowIcon size={14} />
                    </button>
                }

                <button type="button" className={`${styles.iconButton} ${styles.volumeButton}`} onClick={() => setMuted((m) => !m)} aria-label={muted ? "Turn sound on" : "Mute"} aria-pressed={!muted}>
                    {muted ? <MutedIcon size={36} /> : <VolumeIcon size={36} />}
                </button>
                {currentVideo ?
                    <>
                        <button type="button" className={`${styles.iconButton} ${styles.moreButton}`} onClick={() => setMenuOpen((o) => !o)} aria-label="More options" aria-expanded={menuOpen}>
                            <MoreIcon size={40} />
                        </button>
                        {menuOpen ?
                            <div className={styles.menu} role="menu">
                                <button type="button" role="menuitem" onClick={() => share(currentVideo)}>Copy link</button>
                                <Link role="menuitem" href={profileHref(currentVideo)}>
                                    {currentVideo.isOwner ? "Go to your profile" : `View @${currentVideo.author.username}`}
                                </Link>
                                {!currentVideo.isOwner && currentVideo.author.following ?
                                    <button type="button" role="menuitem" onClick={async () => {
                                        setMenuOpen(false)
                                        try {
                                            const result = await setFollow(currentVideo.author.username, false)
                                            dispatch({ type: "updateVideos", update: (v) => (v.author.username === currentVideo.author.username ? { ...v, author: { ...v.author, following: result.following } } : v) })
                                            setToast(`Unfollowed @${currentVideo.author.username}`)
                                        } catch {
                                            setToast("Couldn't unfollow them")
                                        }
                                    }}>Unfollow @{currentVideo.author.username}</button>
                                : null}
                            </div>
                        : null}

                        <div className={styles.details}>
                            <Link href={profileHref(currentVideo)} className={styles.author}>
                                @{currentVideo.author.username}
                            </Link>
                            {currentVideo.caption ? <p className={styles.caption}>{currentVideo.caption}</p> : null}
                        </div>
                        <div className={styles.progress} aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
                    </>
                : null}
            </div>

            {currentVideo ?
                <ul className={styles.engagementBar} aria-label="Video actions">
                    <li className={styles.pfpItem}>
                        <Link href={profileHref(currentVideo)} className={styles.pfp} aria-label={`@${currentVideo.author.username}'s profile`}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- profile pictures can come from Cloudinary or Google */}
                            <img src={currentVideo.author.pfp ?? "/male_default.svg"} alt="" />
                        </Link>
                        {!currentVideo.isOwner && !currentVideo.author.following ?
                            <button type="button" className={styles.followBadge} onClick={() => follow(currentVideo)} aria-label={`Follow @${currentVideo.author.username}`}>
                                <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.3125V10.6875M10.6875 6H1.3125" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                        : null}
                    </li>
                    <li>
                        <button type="button" className={`${styles.action} ${currentVideo.liked ? styles.liked : ""}`} onClick={() => toggle(currentVideo, "like")} aria-pressed={currentVideo.liked} aria-label={currentVideo.liked ? "Unlike" : "Like"}>
                            <HeartIcon />
                        </button>
                        <span className={styles.count}>{formatCount(currentVideo.likes)}</span>
                    </li>
                    <li>
                        <button type="button" className={styles.action} disabled title="Comments are coming soon" aria-label="Comments (coming soon)">
                            <CommentIcon />
                        </button>
                    </li>
                    <li>
                        <button type="button" className={`${styles.action} ${currentVideo.favourited ? styles.favourited : ""}`} onClick={() => toggle(currentVideo, "favourite")} aria-pressed={currentVideo.favourited} aria-label={currentVideo.favourited ? "Remove from favourites" : "Add to favourites"}>
                            <BookmarkIcon />
                        </button>
                        <span className={styles.count}>{formatCount(currentVideo.favourites)}</span>
                    </li>
                    <li>
                        <button type="button" className={styles.action} onClick={() => share(currentVideo)} aria-label="Share">
                            <ShareIcon />
                        </button>
                    </li>
                </ul>
            : <div className={styles.engagementBar} aria-hidden="true" />}

            <div className={styles.navigation}>
                <button type="button" className={styles.navUp} onClick={() => go(-1)} disabled={index === 0} aria-label="Previous video"><ArrowIcon size={30} /></button>
                <button type="button" className={styles.navDown} onClick={() => go(1)} disabled={index >= items.length - 1} aria-label="Next video"><ArrowIcon size={30} /></button>
            </div>

            {toast ? <p className={styles.toast} role="status">{toast}</p> : null}
        </div>
    )
}
