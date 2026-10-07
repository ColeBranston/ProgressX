"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Playback } from "./videoTypes";

type VideoPlayerProps = {
    playback: Playback,
    active: boolean,  // plays while true, pauses while false
    muted: boolean,
    className?: string,
    label: string,
    onProgress?: (fraction: number) => void,
    onError?: () => void,
}

// One video, played straight from its signed R2 link. Inactive videos (the ones next to the current
// one in the feed) only load their poster; the file itself starts loading when the video is shown.
const VideoPlayer = forwardRef<HTMLVideoElement | null, VideoPlayerProps>(function VideoPlayer(
    { playback, active, muted, className, label, onProgress, onError }, ref,
) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement)

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        if (active) {
            video.play().catch(() => { /* autoplay blocked: the user can tap to play */ })
        } else {
            video.pause()
        }
    }, [active])

    useEffect(() => {
        if (videoRef.current) videoRef.current.muted = muted
    }, [muted])

    return (
        <video
            ref={videoRef}
            className={className}
            src={playback.src}
            poster={playback.poster ?? undefined}
            muted={muted}
            loop
            playsInline
            preload={active ? "auto" : playback.poster ? "none" : "metadata"}
            aria-label={label}
            onTimeUpdate={(e) => {
                const v = e.currentTarget
                if (v.duration) onProgress?.(v.currentTime / v.duration)
            }}
            onError={() => onError?.()}
        />
    )
})

export default VideoPlayer
