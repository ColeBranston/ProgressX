"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./VideoViewer.module.css";
import VideoPlayer from "./VideoPlayer";
import { ArrowIcon, BookmarkIcon, HeartIcon, MutedIcon, ShareIcon, VolumeIcon } from "./icons";
import { Reaction, VideoCard, formatCount, setReaction } from "./videoTypes";
import { backdrop } from "../a11y";

type VideoViewerProps = {
    videos: VideoCard[],
    index: number,
    onIndex: (index: number) => void,
    onClose: () => void,
    onChange: (video: VideoCard) => void,
    onDelete: (id: string) => void,
}

// A video from a profile grid, full size, with like / favourite / share (and delete for your own).
// Left / right arrows move through the grid; Escape closes.
export default function VideoViewer({ videos, index, onIndex, onClose, onChange, onDelete }: VideoViewerProps) {
    const video = videos[index]
    const [ muted, setMuted ] = useState(false) // opened with a click, so sound is allowed
    const [ paused, setPaused ] = useState(false)
    const [ failed, setFailed ] = useState(false)
    const [ confirming, setConfirming ] = useState(false)
    const [ busy, setBusy ] = useState(false)
    const [ notice, setNotice ] = useState<string | null>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)

    useEffect(() => {
        setPaused(false)
        setFailed(false)
        setConfirming(false)
        setNotice(null)
    }, [video?.id])

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        closeRef.current?.focus()
        return () => previouslyFocused?.focus()
    }, [])

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose()
            else if (e.key === "ArrowRight" && index < videos.length - 1) onIndex(index + 1)
            else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [index, videos.length, onClose, onIndex])

    if (!video) return null

    async function toggle(reaction: Reaction) {
        const on = reaction === "like" ? !video.liked : !video.favourited
        onChange({
            ...video,
            ...(reaction === "like"
                ? { liked: on, likes: Math.max(0, video.likes + (on ? 1 : -1)) }
                : { favourited: on, favourites: Math.max(0, video.favourites + (on ? 1 : -1)) }),
        })
        try {
            onChange({ ...video, ...await setReaction(video.id, reaction, on) })
        } catch (e) {
            onChange(video)
            setNotice(e instanceof Error ? e.message : "Couldn't save that")
        }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/?v=${video.id}`)
            setNotice("Link copied")
        } catch {
            setNotice("Couldn't copy the link")
        }
    }

    async function remove() {
        setBusy(true)
        try {
            const res = await fetch(`/api/videos/${video.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Couldn't delete the video")
            onDelete(video.id)
        } catch (e) {
            setNotice(e instanceof Error ? e.message : "Couldn't delete the video")
            setBusy(false)
        }
    }

    const profileHref = video.isOwner ? "/profile" : `/profile/${encodeURIComponent(video.author.username)}`

    return (
        <div className={styles.backdrop} {...backdrop(onClose)}>
            <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={video.caption || `Video by @${video.author.username}`}>
                <div className={styles.stage}>
                    {video.playback && !failed ?
                        <VideoPlayer
                            ref={videoRef}
                            key={video.id}
                            playback={video.playback}
                            active={!paused}
                            muted={muted}
                            className={styles.video}
                            label={video.caption || `Video by @${video.author.username}`}
                            onError={() => setFailed(true)}
                        />
                    :   <p className={styles.unavailable}>This video can&apos;t be played right now</p>}
                    <button
                        type="button"
                        className={styles.tapLayer}
                        onClick={() => {
                            // if the browser blocked autoplay, the first tap starts the video
                            if (videoRef.current?.paused && !paused) videoRef.current.play().catch(() => {})
                            else setPaused((p) => !p)
                        }}
                        aria-label={paused ? "Play" : "Pause"}
                    >
                        {paused ? <span className={styles.playBadge} aria-hidden="true"><ArrowIcon size={40} /></span> : null}
                    </button>
                    <button type="button" className={styles.mute} onClick={() => setMuted((m) => !m)} aria-label={muted ? "Turn sound on" : "Mute"} aria-pressed={!muted}>
                        {muted ? <MutedIcon size={30} /> : <VolumeIcon size={30} />}
                    </button>
                    {index > 0 ? <button type="button" className={`${styles.step} ${styles.prev}`} onClick={() => onIndex(index - 1)} aria-label="Previous video"><ArrowIcon size={26} /></button> : null}
                    {index < videos.length - 1 ? <button type="button" className={`${styles.step} ${styles.next}`} onClick={() => onIndex(index + 1)} aria-label="Next video"><ArrowIcon size={26} /></button> : null}
                </div>

                <div className={styles.side}>
                    <div className={styles.header}>
                        <Link href={profileHref} className={styles.author}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- profile pictures can come from Cloudinary or Google */}
                            <img src={video.author.pfp ?? "/male_default.svg"} alt="" />
                            <span>
                                <strong>@{video.author.username}</strong>
                                <small>{new Date(video.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small>
                            </span>
                        </Link>
                        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close">×</button>
                    </div>
                    {video.caption ? <p className={styles.caption}>{video.caption}</p> : null}

                    <div className={styles.actions}>
                        <button type="button" className={video.liked ? styles.on : ""} onClick={() => toggle("like")} aria-pressed={video.liked}>
                            <HeartIcon size={18} /> {formatCount(video.likes)} <span className={styles.srOnly}>{video.liked ? "Unlike" : "Like"}</span>
                        </button>
                        <button type="button" className={video.favourited ? styles.on : ""} onClick={() => toggle("favourite")} aria-pressed={video.favourited}>
                            <BookmarkIcon size={18} /> {formatCount(video.favourites)} <span className={styles.srOnly}>{video.favourited ? "Remove from favourites" : "Favourite"}</span>
                        </button>
                        <button type="button" onClick={copyLink}>
                            <ShareIcon size={16} /> Copy link
                        </button>
                    </div>

                    {video.isOwner ?
                        <div className={styles.owner}>
                            {confirming ?
                                <>
                                    <p>Delete this video? Its likes and favourites go with it.</p>
                                    <div>
                                        <button type="button" className={styles.danger} onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
                                        <button type="button" className={styles.textButton} onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
                                    </div>
                                </>
                            :   <button type="button" className={styles.textButton} onClick={() => setConfirming(true)}>Delete video</button>}
                        </div>
                    : null}
                    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
                </div>
            </div>
        </div>
    )
}
