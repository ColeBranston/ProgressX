"use client";

import { DragEvent, useEffect, useRef, useState } from "react";
import styles from "./VideoUploadForm.module.css";
import { CAPTION_MAX, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_TYPES } from "./videoTypes";

type VideoUploadFormProps = {
    onClose: () => void,
    onUploaded: () => void, // a video was posted
}

type Step =
    | { name: "pick" }
    | { name: "details", file: File, type: string, preview: string, duration: number | null }
    | { name: "uploading", percent: number }
    | { name: "checking" }
    | { name: "done" }

const EXTENSION_TYPES: Record<string, string> = { mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime" }
const POSTER_MAX_SIDE = 720

// The file's video type: from the browser, or from its extension when the browser doesn't say
function videoType(file: File): string | null {
    if (VIDEO_TYPES.includes(file.type)) return file.type
    if (file.type && file.type !== "application/octet-stream") return null
    return EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null
}

// The video's length, read locally; null if this browser can't decode it (the server still checks)
function readDuration(url: string): Promise<number | null> {
    return new Promise((resolve) => {
        const video = document.createElement("video")
        const done = (value: number | null) => { clearTimeout(timer); video.removeAttribute("src"); video.load(); resolve(value) }
        const timer = setTimeout(() => done(null), 8000)
        video.preload = "metadata"
        video.muted = true
        video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null)
        video.onerror = () => done(null)
        video.src = url
    })
}

// A frame from about a second in, as a small JPEG for the video's thumbnail (the server re-encodes
// it); null if this browser can't decode the video (e.g. HEVC in some browsers)
async function capturePoster(video: HTMLVideoElement | null): Promise<{ poster: string, width: number, height: number } | null> {
    if (!video || !video.videoWidth) return null
    try {
        const target = Math.min(1, (video.duration || 2) / 2)
        if (Math.abs(video.currentTime - target) > 0.05 || video.readyState < 2) {
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("seek timed out")), 4000)
                video.addEventListener("seeked", () => { clearTimeout(timer); resolve() }, { once: true })
                video.currentTime = target
            })
        }
        const scale = Math.min(1, POSTER_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
        return { poster: canvas.toDataURL("image/jpeg", 0.8), width: video.videoWidth, height: video.videoHeight }
    } catch {
        return null
    }
}

// Posting a video: choose (or drop) a file, add a caption, then it uploads straight to Cloudflare R2
// with a progress bar. Files are checked here for a quick answer, and the server checks the bytes that
// actually arrived (a real MP4 / MOV, size, length) before the video is posted.
export default function VideoUploadForm({ onClose, onUploaded }: VideoUploadFormProps) {
    const [ step, setStep ] = useState<Step>({ name: "pick" })
    const [ caption, setCaption ] = useState("")
    const [ error, setError ] = useState<string | null>(null)
    const [ dragging, setDragging ] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)
    const xhrRef = useRef<XMLHttpRequest | null>(null)
    const videoIdRef = useRef<string | null>(null)
    const closedRef = useRef(false)
    const previewRef = useRef<HTMLVideoElement>(null)

    const previewUrl = step.name === "details" ? step.preview : null
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    useEffect(() => {
        closedRef.current = false // (re)mounted: React's dev mode mounts twice
        return () => {
            closedRef.current = true
            xhrRef.current?.abort()
        }
    }, [])

    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === "Escape") close() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    })

    async function choose(file: File | undefined) {
        setError(null)
        if (!file) return
        const type = videoType(file)
        if (!type) return setError("Choose an MP4 or MOV video")
        if (file.size > MAX_VIDEO_BYTES) return setError("Videos must be 200 MB or smaller")
        if (file.size === 0) return setError("That file is empty")

        const preview = URL.createObjectURL(file)
        const duration = await readDuration(preview)
        if (duration !== null && duration > MAX_VIDEO_SECONDS + 0.5) {
            URL.revokeObjectURL(preview)
            return setError(`Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes long`)
        }
        setStep({ name: "details", file, type, preview, duration })
    }

    function onDrop(e: DragEvent) {
        e.preventDefault()
        setDragging(false)
        if (step.name === "pick") choose(e.dataTransfer.files?.[0])
    }

    async function post() {
        if (step.name !== "details") return
        const { file, type, duration } = step
        setError(null)
        const frame = await capturePoster(previewRef.current)
        setStep({ name: "uploading", percent: 0 })

        try {
            const res = await fetch("/api/videos/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caption, sizeBytes: file.size, type, durationSeconds: duration }),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok) throw new Error(json?.message ?? "Couldn't start the upload")
            videoIdRef.current = json.video.id

            await sendFile(json.uploadURL, file, json.contentType)
            if (closedRef.current) return
            setStep({ name: "checking" })

            const done = await fetch(`/api/videos/${json.video.id}/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ poster: frame?.poster, width: frame?.width, height: frame?.height }),
            })
            const result = await done.json().catch(() => null)
            if (!done.ok) throw new Error(result?.message ?? "Couldn't post the video")
            videoIdRef.current = null
            if (closedRef.current) return
            setStep({ name: "done" })
            onUploaded()
        } catch (e) {
            if (closedRef.current) return
            setError(e instanceof Error ? e.message : "The upload failed")
            setStep({ name: "pick" })
            // a video that never arrived is cleaned up so it doesn't sit on the profile
            if (videoIdRef.current) fetch(`/api/videos/${videoIdRef.current}`, { method: "DELETE" }).catch(() => {})
            videoIdRef.current = null
        }
    }

    // PUT straight to R2 with the signed link; the type must match what was signed
    function sendFile(uploadURL: string, file: File, contentType: string) {
        return new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhrRef.current = xhr
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) setStep({ name: "uploading", percent: Math.round((e.loaded / e.total) * 100) })
            }
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "Videos must be 200 MB or smaller" : "The upload failed. Check your connection and try again.")))
            xhr.onerror = () => reject(new Error("The upload failed. Check your connection and try again."))
            xhr.onabort = () => reject(new Error("Upload cancelled"))
            xhr.open("PUT", uploadURL)
            xhr.setRequestHeader("Content-Type", contentType)
            xhr.send(file)
        })
    }

    function close() {
        if (step.name === "uploading" || step.name === "checking") {
            if (!window.confirm("Cancel this upload?")) return
            xhrRef.current?.abort()
            if (videoIdRef.current) fetch(`/api/videos/${videoIdRef.current}`, { method: "DELETE" }).catch(() => {})
        }
        onClose()
    }

    return (
        <div className={styles.backdrop} onClick={close}>
            <div className={styles.container} role="dialog" aria-modal="true" aria-label="Post a video" onClick={(e) => e.stopPropagation()}>
                <button type="button" className={styles.exitButton} onClick={close} aria-label="Close">×</button>

                {step.name === "pick" ?
                    <button
                        type="button"
                        className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
                        onClick={() => fileInput.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                    >
                        <svg width="80" height="80" viewBox="0 0 42 42" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" clipRule="evenodd" d="M21 27.5625C21.7249 27.5625 22.3125 26.9748 22.3125 26.25V7.04802L25.2536 10.4792C25.7252 11.0295 26.5538 11.0933 27.1042 10.6215C27.6546 10.1498 27.7183 9.3212 27.2465 8.77084L21.9965 2.64584C21.7473 2.35492 21.3831 2.1875 21 2.1875C20.6169 2.1875 20.2528 2.35492 20.0036 2.64584L14.7535 8.77084C14.2818 9.3212 14.3455 10.1498 14.8959 10.6215C15.4462 11.0933 16.2748 11.0295 16.7465 10.4792L19.6875 7.04802V26.25C19.6875 26.9748 20.2752 27.5625 21 27.5625Z" fill="#E20000"/>
                            <path d="M28 15.75C26.7712 15.75 26.1567 15.75 25.7154 16.0449C25.5243 16.1726 25.3601 16.3367 25.2325 16.5278C24.9375 16.9692 24.9375 17.5836 24.9375 18.8125V26.25C24.9375 28.4246 23.1747 30.1875 21 30.1875C18.8254 30.1875 17.0626 28.4246 17.0626 26.25V18.8125C17.0626 17.5836 17.0626 16.9691 16.7676 16.5277C16.6399 16.3367 16.4759 16.1726 16.2849 16.045C15.8435 15.75 15.229 15.75 14 15.75C9.05025 15.75 6.57538 15.75 5.03769 17.2877C3.5 18.8255 3.5 21.2999 3.5 26.2496V27.9996C3.5 32.9493 3.5 35.4242 5.03769 36.9619C6.57538 38.4996 9.05025 38.4996 14 38.4996H28C32.9497 38.4996 35.4245 38.4996 36.9623 36.9619C38.5 35.4242 38.5 32.9493 38.5 27.9996V26.2496C38.5 21.2999 38.5 18.8255 36.9623 17.2877C35.4245 15.75 32.9497 15.75 28 15.75Z" fill="#E20000"/>
                        </svg>
                        <span className={styles.selectHeader}>Select Video to Upload</span>
                        <span className={styles.selectBody}>or drag and drop it here</span>
                        <span className={styles.selectButton}>Select Video</span>
                        <span className={styles.limits}>MP4 or MOV · up to {MAX_VIDEO_SECONDS / 60} minutes · 200 MB</span>
                    </button>
                : step.name === "details" ?
                    <form className={styles.details} onSubmit={(e) => { e.preventDefault(); post() }}>
                        <video ref={previewRef} src={step.preview} className={styles.preview} controls muted playsInline />
                        <div className={styles.fields}>
                            <label htmlFor="video-caption" className={styles.label}>Caption</label>
                            <textarea
                                id="video-caption"
                                className={styles.caption}
                                value={caption}
                                maxLength={CAPTION_MAX}
                                onChange={(e) => setCaption(e.target.value)}
                                placeholder="What are you working on?"
                                rows={4}
                            />
                            <span className={styles.counter}>{caption.length}/{CAPTION_MAX}</span>
                            <p className={styles.hint}>
                                Your profile is what decides who sees this: public profiles show up in For You, private ones only to you.
                            </p>
                            <div className={styles.buttons}>
                                <button type="submit" className={styles.primary}>Post video</button>
                                <button type="button" className={styles.secondary} onClick={() => setStep({ name: "pick" })}>Choose another</button>
                            </div>
                        </div>
                    </form>
                : step.name === "uploading" ?
                    <div className={styles.status} role="status">
                        <p className={styles.statusTitle}>Uploading… {step.percent}%</p>
                        <div className={styles.bar} aria-hidden="true"><span style={{ width: `${step.percent}%` }} /></div>
                        <p className={styles.hint}>Keep this open until the upload finishes.</p>
                    </div>
                : step.name === "checking" ?
                    <div className={styles.status} role="status">
                        <span className={styles.spinner} aria-hidden="true" />
                        <p className={styles.statusTitle}>Checking your video</p>
                        <p className={styles.hint}>Just a few seconds.</p>
                    </div>
                :
                    <div className={styles.status} role="status">
                        <p className={styles.statusTitle}>Posted!</p>
                        <p className={styles.hint}>Your video is on your profile.</p>
                        <button type="button" className={styles.primary} onClick={onClose}>Done</button>
                    </div>
                }

                {error ? <p className={styles.error} role="alert">{error}</p> : null}

                <input
                    ref={fileInput}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v"
                    onChange={(e) => { choose(e.target.files?.[0]); e.target.value = "" }}
                    hidden
                />
            </div>
        </div>
    )
}
