"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./ForYouFeed.module.css";
import VideoPlayer from "./VideoPlayer";
import { ArrowIcon, BookmarkIcon, CommentIcon, HeartIcon, MoreIcon, MutedIcon, ShareIcon, VolumeIcon } from "./icons";
import { Reaction, VideoCard, formatCount, setFollow, setReaction } from "./videoTypes";

const NAV_COOLDOWN_MS = 550
const SWIPE_PX = 50

// The For You feed (newest public videos) or the Following feed (videos from people you follow): one
// video at a time. Up / down arrows, the mouse wheel, arrow keys or a swipe move between videos;
// tapping the video pauses it.
export default function ForYouFeed({ source = "for-you" }: { source?: "for-you" | "following" }) {
    const start = useSearchParams().get("v")
    const [ followsAnyone, setFollowsAnyone ] = useState(true)
    const [ videos, setVideos ] = useState<VideoCard[]>([])
    const [ cursor, setCursor ] = useState<string | null>(null)
    const [ state, setState ] = useState<"loading" | "ready" | "error">("loading")
    const [ index, setIndex ] = useState(0)
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

    const load = useCallback(async (next: string | null) => {
        if (loadingMore.current) return
        loadingMore.current = true
        try {
            const query = new URLSearchParams(next ? { cursor: next } : start ? { start } : {})
            const res = await fetch(`${source === "following" ? "/api/videos/following" : "/api/videos/feed"}?${query}`)
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setVideos((prev) => {
                const seen = new Set(prev.map((v) => v.id))
                return [...prev, ...(json.videos as VideoCard[]).filter((v) => !seen.has(v.id))]
            })
            setCursor(json.nextCursor ?? null)
            if (json.followsAnyone === false) setFollowsAnyone(false)
            setState("ready")
        } catch (e) {
            console.error("Failed to load the feed: ", e)
            if (!next) setState("error")
        } finally {
            loadingMore.current = false
        }
    }, [start, source])

    useEffect(() => { load(null) }, [load])

    // fetch the next page a few videos before the end
    useEffect(() => {
        if (cursor && index >= videos.length - 3) load(cursor)
    }, [index, videos.length, cursor, load])

    const go = useCallback((delta: number) => {
        const now = Date.now()
        if (now - lastNav.current < NAV_COOLDOWN_MS) return
        lastNav.current = now
        setIndex((i) => {
            const next = Math.max(0, Math.min(videos.length - 1, i + delta))
            if (next !== i) {
                setPaused(false)
                setProgress(0)
                setMenuOpen(false)
            }
            return next
        })
    }, [videos.length])

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

    const current = videos[index]

    async function toggle(video: VideoCard, reaction: Reaction) {
        const on = reaction === "like" ? !video.liked : !video.favourited
        const optimistic = reaction === "like"
            ? { liked: on, likes: Math.max(0, video.likes + (on ? 1 : -1)) }
            : { favourited: on, favourites: Math.max(0, video.favourites + (on ? 1 : -1)) }
        const update = (patch: Partial<VideoCard>) => setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, ...patch } : v)))
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
        const update = (following: boolean) => setVideos((prev) => prev.map((v) => (v.author.username === video.author.username ? { ...v, author: { ...v.author, following } } : v)))
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
                            <button type="button" className={styles.messageButton} onClick={() => { setState("loading"); load(null) }}>Try again</button>
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
                aria-label={`Video ${index + 1} of ${videos.length}${cursor ? "+" : ""}`}
            >
                {videos.map((video, i) => Math.abs(i - index) > 1 ? null : (
                    <div key={video.id} className={styles.slide} style={{ transform: `translateY(${(i - index) * 100}%)` }} aria-hidden={i !== index}>
                        {video.playback && !failed.has(video.id) ?
                            <VideoPlayer
                                ref={i === index ? activeVideo : undefined}
                                playback={video.playback}
                                active={i === index && !paused}
                                muted={muted}
                                className={styles.video}
                                label={video.caption || `Video by @${video.author.username}`}
                                onProgress={i === index ? setProgress : undefined}
                                onError={() => markFailed(video.id)}
                            />
                        :   <p className={styles.unavailable}>This video can&apos;t be played right now</p>}
                    </div>
                ))}

                <button type="button" className={styles.tapLayer} onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}>
                    {paused ? <span className={styles.playBadge} aria-hidden="true"><ArrowIcon size={44} /></span> : null}
                </button>

                <button type="button" className={`${styles.iconButton} ${styles.volumeButton}`} onClick={() => setMuted((m) => !m)} aria-label={muted ? "Turn sound on" : "Mute"} aria-pressed={!muted}>
                    {muted ? <MutedIcon size={36} /> : <VolumeIcon size={36} />}
                </button>
                <button type="button" className={`${styles.iconButton} ${styles.moreButton}`} onClick={() => setMenuOpen((o) => !o)} aria-label="More options" aria-expanded={menuOpen}>
                    <MoreIcon size={40} />
                </button>
                {menuOpen ?
                    <div className={styles.menu} role="menu">
                        <button type="button" role="menuitem" onClick={() => share(current)}>Copy link</button>
                        <Link role="menuitem" href={current.isOwner ? "/profile" : `/profile/${encodeURIComponent(current.author.username)}`}>
                            {current.isOwner ? "Go to your profile" : `View @${current.author.username}`}
                        </Link>
                        {!current.isOwner && current.author.following ?
                            <button type="button" role="menuitem" onClick={async () => {
                                setMenuOpen(false)
                                try {
                                    const result = await setFollow(current.author.username, false)
                                    setVideos((prev) => prev.map((v) => (v.author.username === current.author.username ? { ...v, author: { ...v.author, following: result.following } } : v)))
                                    setToast(`Unfollowed @${current.author.username}`)
                                } catch {
                                    setToast("Couldn't unfollow them")
                                }
                            }}>Unfollow @{current.author.username}</button>
                        : null}
                    </div>
                : null}

                <div className={styles.details}>
                    <Link href={current.isOwner ? "/profile" : `/profile/${encodeURIComponent(current.author.username)}`} className={styles.author}>
                        @{current.author.username}
                    </Link>
                    {current.caption ? <p className={styles.caption}>{current.caption}</p> : null}
                </div>
                <div className={styles.progress} aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
            </div>

            <ul className={styles.engagementBar} aria-label="Video actions">
                <li className={styles.pfpItem}>
                    <Link href={current.isOwner ? "/profile" : `/profile/${encodeURIComponent(current.author.username)}`} className={styles.pfp} aria-label={`@${current.author.username}'s profile`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- profile pictures can come from Cloudinary or Google */}
                        <img src={current.author.pfp ?? "/male_default.svg"} alt="" />
                    </Link>
                    {!current.isOwner && !current.author.following ?
                        <button type="button" className={styles.followBadge} onClick={() => follow(current)} aria-label={`Follow @${current.author.username}`}>
                            <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.3125V10.6875M10.6875 6H1.3125" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                    : null}
                </li>
                <li>
                    <button type="button" className={`${styles.action} ${current.liked ? styles.liked : ""}`} onClick={() => toggle(current, "like")} aria-pressed={current.liked} aria-label={current.liked ? "Unlike" : "Like"}>
                        <HeartIcon />
                    </button>
                    <span className={styles.count}>{formatCount(current.likes)}</span>
                </li>
                <li>
                    <button type="button" className={styles.action} disabled title="Comments are coming soon" aria-label="Comments (coming soon)">
                        <CommentIcon />
                    </button>
                </li>
                <li>
                    <button type="button" className={`${styles.action} ${current.favourited ? styles.favourited : ""}`} onClick={() => toggle(current, "favourite")} aria-pressed={current.favourited} aria-label={current.favourited ? "Remove from favourites" : "Add to favourites"}>
                        <BookmarkIcon />
                    </button>
                    <span className={styles.count}>{formatCount(current.favourites)}</span>
                </li>
                <li>
                    <button type="button" className={styles.action} onClick={() => share(current)} aria-label="Share">
                        <ShareIcon />
                    </button>
                </li>
            </ul>

            <div className={styles.navigation}>
                <button type="button" className={styles.navUp} onClick={() => go(-1)} disabled={index === 0} aria-label="Previous video"><ArrowIcon size={30} /></button>
                <button type="button" className={styles.navDown} onClick={() => go(1)} disabled={index >= videos.length - 1} aria-label="Next video"><ArrowIcon size={30} /></button>
            </div>

            {toast ? <p className={styles.toast} role="status">{toast}</p> : null}
        </div>
    )
}
