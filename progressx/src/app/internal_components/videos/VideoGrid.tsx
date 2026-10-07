"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import styles from "./VideoGrid.module.css";
import VideoViewer from "./VideoViewer";
import { VideoCard, formatCount, formatDuration } from "./videoTypes";

type VideoGridProps = {
    user?: string, // "me" or a username
    tab: "videos" | "liked" | "favourites" | "search",
    search?: string, // with tab "search": the search words
    leading?: ReactNode, // e.g. the "Add new video" tile
    empty: ReactNode,
    refreshKey?: number, // bump to reload (after an upload)
}


// A profile tab's videos as thumbnails; clicking one opens it in the viewer. Your own unfinished
// uploads (the tab was closed mid-upload) show up so you can remove them; they also clear on their own.
export default function VideoGrid({ user = "me", tab, search = "", leading, empty, refreshKey = 0 }: VideoGridProps) {
    const [ videos, setVideos ] = useState<VideoCard[] | null>(null)
    const [ cursor, setCursor ] = useState<string | null>(null)
    const [ error, setError ] = useState<string | null>(null)
    const [ loadingMore, setLoadingMore ] = useState(false)
    const [ open, setOpen ] = useState<number | null>(null)

    const fetchPage = useCallback(async (next: string | null) => {
        const cursorParam: Record<string, string> = next ? { cursor: next } : {}
        const res = tab === "search"
            ? await fetch(`/api/find?${new URLSearchParams({ q: search, type: "videos", ...cursorParam })}`)
            : await fetch(`/api/videos?${new URLSearchParams({ user, tab, ...cursorParam })}`)
        const json = await res.json().catch(() => null)
        if (res.status === 403 && json?.private) throw new Error("This account is private")
        if (!res.ok) throw new Error(json?.message ?? "Couldn't load videos")
        return json as { videos: VideoCard[], nextCursor: string | null }
    }, [user, tab, search])

    useEffect(() => {
        let cancelled = false
        setError(null)
        fetchPage(null)
            .then((page) => {
                if (cancelled) return
                setVideos(page.videos)
                setCursor(page.nextCursor)
            })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load videos") })
        return () => { cancelled = true }
    }, [fetchPage, refreshKey])

    async function loadMore() {
        if (!cursor) return
        setLoadingMore(true)
        try {
            const page = await fetchPage(cursor)
            setVideos((prev) => {
                const seen = new Set((prev ?? []).map((v) => v.id))
                return [...(prev ?? []), ...page.videos.filter((v) => !seen.has(v.id))]
            })
            setCursor(page.nextCursor)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't load videos")
        } finally {
            setLoadingMore(false)
        }
    }

    function changed(updated: VideoCard) {
        setVideos((prev) => (prev ?? []).map((v) => (v.id === updated.id ? updated : v)))
    }

    function close() {
        setOpen(null)
        // un-liking / un-favouriting takes it off that list (once the viewer closes, so it doesn't jump)
        setVideos((prev) => (prev ?? []).filter((v) => (tab === "liked" ? v.liked : tab === "favourites" ? v.favourited : true)))
    }

    function removed(id: string) {
        setVideos((prev) => (prev ?? []).filter((v) => v.id !== id))
        setOpen(null)
    }

    async function removeFailed(id: string) {
        const res = await fetch(`/api/videos/${id}`, { method: "DELETE" })
        if (res.ok) removed(id)
        else setError((await res.json().catch(() => null))?.message ?? "Couldn't remove that video")
    }

    if (error && !videos) {
        return <div className={styles.grid}>{leading}<p className={styles.notice}>{error}</p></div>
    }
    if (!videos) {
        return <div className={styles.grid}>{leading}<span className={styles.spinner} role="status" aria-label="Loading videos" /></div>
    }

    const viewable = videos.filter((v) => v.status === "ready" && v.playback)

    return (
        <>
            {videos.length === 0 && !leading ? empty : null}
            <div className={styles.grid}>
                {leading}
                {videos.length === 0 && leading ? <div className={styles.inlineEmpty}>{empty}</div> : null}
                {videos.map((video) => {
                    const ready = video.status === "ready" && video.playback
                    if (video.status !== "ready") {
                        return (
                            <div key={video.id} className={styles.tile}>
                                <span className={styles.state}>
                                    {video.status === "uploading" ? "This upload didn't finish" : "Couldn't post this video"}
                                    {video.isOwner ? <button type="button" className={styles.remove} onClick={() => removeFailed(video.id)}>Remove</button> : null}
                                </span>
                            </div>
                        )
                    }
                    return (
                        <button
                            key={video.id}
                            type="button"
                            className={styles.tile}
                            onClick={() => (ready ? setOpen(viewable.findIndex((v) => v.id === video.id)) : undefined)}
                            disabled={!ready}
                            aria-label={ready ? `Play ${video.caption || "video"}` : "Video unavailable"}
                        >
                            {!ready ?
                                <span className={styles.state}>Can&apos;t load this video right now</span>
                            : video.playback!.poster ?
                                // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived R2 link
                                <img src={video.playback!.poster} alt="" loading="lazy" className={styles.thumb} />
                            :
                                // no poster (the uploader's browser couldn't capture one): show an early frame
                                <video src={`${video.playback!.src}#t=0.5`} preload="metadata" muted playsInline className={styles.thumb} aria-hidden="true" />
                            }
                            {ready ?
                                <span className={styles.overlay}>
                                    <span className={styles.stat}>
                                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M12 3.75C12 2.09314 10.6568 0.75 9 0.75C7.34314 0.75 6 2.09314 6 3.75C6 2.09314 4.65686 0.75 3 0.75C1.34314 0.75 0 2.09314 0 3.75C0 8.625 6 11.25 6 11.25C6 11.25 12 8.625 12 3.75Z"/></svg>
                                        {formatCount(video.likes)}
                                    </span>
                                    <span>{formatDuration(video.durationS)}</span>
                                </span>
                            : null}
                            {tab !== "videos" ? <span className={styles.byline}>@{video.author.username}</span> : null}
                        </button>
                    )
                })}
                {cursor ?
                    <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? "Loading…" : "Load more"}
                    </button>
                : null}
            </div>
            {error ? <p className={styles.notice} role="alert">{error}</p> : null}

            {open !== null && viewable[open] ?
                <VideoViewer
                    videos={viewable}
                    index={open}
                    onIndex={setOpen}
                    onClose={close}
                    onChange={changed}
                    onDelete={removed}
                />
            : null}
        </>
    )
}
