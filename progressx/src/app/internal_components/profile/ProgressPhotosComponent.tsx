"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import styles from './ProgressPhotos.module.css'
import { cloudinaryBlurredFull, cloudinaryBlurredThumb, cloudinaryLoader, cloudinaryPlaceholder, cloudinaryThumbLoader } from "./cloudinaryImage";

import dayjs from 'dayjs'
import { useSearchParams, useRouter } from "next/navigation";
import { backdrop } from "../a11y";

export type ProgressPhoto = {
    id: string,
    image_link: string,
    created_at: string,
    description?: string | null
}

// Tiles are rendered in batches as you scroll, so large collections don't mount hundreds of images at once
const BATCH_SIZE = 24
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // matches the upload route

const EyeOffIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3L21 21M10.6 10.6C10.2 11 10 11.5 10 12C10 13.1 10.9 14 12 14C12.5 14 13 13.8 13.4 13.4M7.4 7.4C5.4 8.6 3.9 10.3 3 12C4.8 15.5 8.2 18 12 18C13.6 18 15.1 17.6 16.5 16.8M10 6.2C10.6 6.1 11.3 6 12 6C15.8 6 19.2 8.5 21 12C20.5 13 19.9 13.9 19.2 14.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
)

const EyeIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12C4.8 8.5 8.2 6 12 6C15.8 6 19.2 8.5 21 12C19.2 15.5 15.8 18 12 18C8.2 18 4.8 15.5 3 12Z" strokeLinejoin="round"/><circle cx="12" cy="12" r="2.5"/></svg>
)

type PhotoTileProps = {
    photo: ProgressPhoto,
    blurred: boolean,
    onOpen: () => void
}

function PhotoTile({ photo, blurred, onOpen }: PhotoTileProps) {
    const [ loaded, setLoaded ] = useState(false)
    const date = dayjs(photo.created_at)

    return (
        <button
            type="button"
            className={styles.tile}
            onClick={onOpen}
            style={{ backgroundImage: `url(${cloudinaryPlaceholder(photo.image_link)})` }}
            aria-label={`Open ${blurred ? "blurred " : ""}progress photo from ${date.format("MMMM D, YYYY")}`}
        >
            {blurred ?
                // only a pre-blurred version is loaded while blurring is on; the sharp photo never reaches the page
                <span className={styles.tileBlurred} style={{ backgroundImage: `url(${cloudinaryBlurredThumb(photo.image_link)})` }}>
                    <span className={styles.blurBadge}><EyeOffIcon /></span>
                </span>
            :
            <Image
                loader={cloudinaryThumbLoader}
                src={photo.image_link}
                alt={`Progress photo from ${date.format("MMMM D, YYYY")}`}
                fill
                sizes="(max-width: 700px) 45vw, 180px"
                loading="lazy"
                className={`${styles.tileImage} ${loaded ? styles.tileImageLoaded : ""}`}
                onLoad={() => setLoaded(true)}
            />
            }
            <span className={styles.tileDate}>{date.format("MMM D")}</span>
        </button>
    )
}

export default function ProgressPhotosComponent() {

    const fileInput = useRef<HTMLInputElement | null>(null)
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const sentinelRef = useRef<HTMLDivElement | null>(null)

    const [ photos, setPhotos ] = useState<ProgressPhoto[] | null>(null) // null while loading
    const [ loadError, setLoadError ] = useState(false)
    const [ visibleCount, setVisibleCount ] = useState(BATCH_SIZE)

    const [ isFormVisible, setIsFormVisible ] = useState(false)
    const [ selectedImage, setSelectedImage ] = useState<File | null>(null)
    const [ selectedImageURL, setSelectedImageURL ] = useState('')
    const [ isDragging, setIsDragging ] = useState(false)
    const [ isUploading, setIsUploading ] = useState(false)
    const [ uploadError, setUploadError ] = useState<string | null>(null)

    const [ viewerIndex, setViewerIndex ] = useState<number | null>(null)
    const [ confirmDelete, setConfirmDelete ] = useState(false)
    const [ isDeleting, setIsDeleting ] = useState(false)

    // "Blur progress photos" privacy setting (saved on the profile). Starts true so nothing
    // sharp can render before the saved value arrives with the photos.
    const [ blurPhotos, setBlurPhotos ] = useState(true)
    const [ blurSaveError, setBlurSaveError ] = useState(false)
    // one photo revealed in the viewer / the upload preview revealed, while blurring stays on
    const [ revealedId, setRevealedId ] = useState<string | null>(null)
    const [ previewRevealed, setPreviewRevealed ] = useState(false)

    const loadPhotos = useCallback(async () => {
        setLoadError(false)
        try {
            const res = await fetch('/api/user/userImages/getUserImages', { method: "GET" })
            if (!res.ok) throw new Error(`status ${res.status}`)

            const body = await res.json()
            setBlurPhotos(body.blurPhotos === true)
            setPhotos(body.images ?? [])
        } catch (err) {
            console.error("Error fetching images: ", err)
            setLoadError(true)
            setPhotos([])
        }
    }, [])

    useEffect(() => {
        // Photos used to be cached here under one shared key, which could show a previous
        // user's photos on a shared browser; always fetch fresh and clear the old cache
        try { localStorage.removeItem("user_photos") } catch { /* storage unavailable */ }
        loadPhotos()
    }, [loadPhotos])

    const params = useSearchParams()
    const submit = params.get("photoSubmit")

    const router = useRouter()

    useEffect(() => {
        if (submit && submit === "true") {
            setIsFormVisible(true)
        }

        if (params.get("videoSubmit")) {
            router.replace(window.location.pathname)
        }
    }, [submit, params, router])

    // Render the next batch of tiles when the sentinel below the grid scrolls into view
    const hasMore = photos !== null && visibleCount < photos.length
    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!hasMore || !sentinel) return

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setVisibleCount((count) => count + BATCH_SIZE)
            }
        }, { root: scrollRef.current, rootMargin: "400px" })

        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, visibleCount])

    // Visible photos grouped by month, keeping each photo's index in the full list for the viewer
    const monthGroups = useMemo(() => {
        if (!photos) return []

        const totals = new Map<string, number>()
        for (const photo of photos) {
            const label = dayjs(photo.created_at).format("MMMM YYYY")
            totals.set(label, (totals.get(label) ?? 0) + 1)
        }

        const groups: { label: string, total: number, items: { photo: ProgressPhoto, index: number }[] }[] = []
        photos.slice(0, visibleCount).forEach((photo, index) => {
            const label = dayjs(photo.created_at).format("MMMM YYYY")
            let group = groups[groups.length - 1]
            if (!group || group.label !== label) {
                group = { label, total: totals.get(label) ?? 0, items: [] }
                groups.push(group)
            }
            group.items.push({ photo, index })
        })
        return groups
    }, [photos, visibleCount])

    const viewerPhoto = viewerIndex !== null && photos ? photos[viewerIndex] ?? null : null

    const closeViewer = useCallback(() => {
        setViewerIndex(null)
        setConfirmDelete(false)
        setRevealedId(null)
    }, [])

    const showPhoto = useCallback((step: number) => {
        if (!photos || viewerIndex === null) return
        const next = viewerIndex + step
        if (next < 0 || next >= photos.length) return
        setConfirmDelete(false)
        setRevealedId(null)
        setViewerIndex(next)
    }, [photos, viewerIndex])

    // Keyboard: arrows move between photos, Escape closes the viewer / upload dialog
    useEffect(() => {
        if (viewerIndex === null && !isFormVisible) return

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                if (confirmDelete) setConfirmDelete(false)
                else if (viewerIndex !== null) closeViewer()
                else closeUpload()
            } else if (viewerIndex !== null && !confirmDelete) {
                if (e.key === "ArrowLeft") showPhoto(-1)
                if (e.key === "ArrowRight") showPhoto(1)
            }
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    })

    async function toggleBlur() {
        const next = !blurPhotos
        setBlurPhotos(next)
        setRevealedId(null)
        setPreviewRevealed(false)
        setBlurSaveError(false)

        try {
            const res = await fetch("/api/user/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blurProgressPhotos: next })
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
        } catch (err) {
            console.error("Failed to save blur setting: ", err)
            setBlurSaveError(true)
            // fail safe: if turning blur ON didn't save, keep the photos blurred for now anyway;
            // only a failed attempt to turn it OFF goes back to blurred
            if (!next) setBlurPhotos(true)
        }
    }

    function selectFile(file: File | undefined) {
        if (!file) return

        // quick checks for a friendly message; the server re-checks and re-encodes every upload
        if (file.type && !file.type.startsWith("image/")) {
            setUploadError("That file isn't an image. Choose a JPG, PNG, WebP or HEIC photo.")
            return
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setUploadError("That photo is over 10 MB. Choose a smaller one.")
            return
        }

        if (selectedImageURL) URL.revokeObjectURL(selectedImageURL)
        setUploadError(null)
        setPreviewRevealed(false)
        setSelectedImage(file)
        setSelectedImageURL(URL.createObjectURL(file))
    }

    function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
        selectFile(e.target.files?.[0])
        e.target.value = ""
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault()
        setIsDragging(false)
        selectFile(e.dataTransfer.files?.[0])
    }

    function closeUpload() {
        if (isUploading) return
        if (selectedImageURL) URL.revokeObjectURL(selectedImageURL)
        setSelectedImage(null)
        setSelectedImageURL('')
        setUploadError(null)
        setIsDragging(false)
        setIsFormVisible(false)
    }

    async function handleImageSubmit() {
        if (!selectedImage || isUploading) return

        setIsUploading(true)
        setUploadError(null)

        try {
            const form_data = new FormData()
            form_data.append("file", selectedImage)

            const res = await fetch('/api/user/userImages/uploadUserImages', {
                method: "POST",
                body: form_data
            })

            if (res.status === 429) {
                setUploadError("You're uploading too quickly. Wait a couple of seconds and try again.")
                setIsUploading(false)
                return
            }

            if (!res.ok) {
                const body = await res.json().catch(() => null)
                throw new Error(body?.message || `status ${res.status}`)
            }

            const body = await res.json()
            if (body.photo) {
                setPhotos((prev) => [body.photo, ...(prev ?? [])])
            } else {
                await loadPhotos()
            }

            setIsUploading(false)
            if (selectedImageURL) URL.revokeObjectURL(selectedImageURL)
            setSelectedImage(null)
            setSelectedImageURL('')
            setIsFormVisible(false)
        } catch (err) {
            console.error("Error uploading image: ", err)
            setUploadError("Upload failed. Check your connection and try again.")
            setIsUploading(false)
        }
    }

    async function handleDeleteImage() {
        if (!viewerPhoto || !photos || isDeleting) return

        setIsDeleting(true)

        try {
            const res = await fetch('/api/user/userImages/deleteUserImages', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: viewerPhoto.id })
            })

            if (!res.ok) throw new Error(`status ${res.status}`)

            const remaining = photos.filter((photo) => photo.id !== viewerPhoto.id)
            setPhotos(remaining)
            setConfirmDelete(false)
            // stay in the viewer on the next photo, or close it if that was the last one
            setViewerIndex(remaining.length === 0 ? null : Math.min(viewerIndex ?? 0, remaining.length - 1))
        } catch (err) {
            console.error("Image failed to be deleted: ", err)
        } finally {
            setIsDeleting(false)
        }
    }

    const addTile = (
        <button type="button" className={styles.addTile} onClick={() => setIsFormVisible(true)}>
            <svg width="36" height="36" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3.3125V12.6875M12.6875 8H3.3125" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Add photo</span>
        </button>
    )

    return (
        <div className={styles.photos} ref={scrollRef}>
            <div className={styles.toolbar}>
                <div className={styles.toolbarText}>
                    <p className={styles.toolbarTitle}>Progress Photos</p>
                    {photos && photos.length > 0 ?
                        <p className={styles.toolbarMeta}>
                            {photos.length} {photos.length === 1 ? "photo" : "photos"} · since {dayjs(photos[photos.length - 1].created_at).format("MMMM YYYY")}
                        </p>
                    : null}
                </div>
                {photos !== null && !loadError ?
                    <div className={styles.blurSetting}>
                        {blurSaveError ? <span className={styles.blurError} role="alert">Couldn&apos;t save, try again</span> : null}
                        <button
                            type="button"
                            role="switch"
                            aria-checked={blurPhotos}
                            aria-label="Blur progress photos"
                            className={`${styles.blurToggle} ${blurPhotos ? styles.blurToggleOn : ""}`}
                            onClick={toggleBlur}
                            title="Blur your progress photos, e.g. when viewing your profile in public"
                        >
                            {blurPhotos ? <EyeOffIcon /> : <EyeIcon />}
                            <span className={styles.blurLabel}>Blur photos</span>
                            <span className={styles.switchTrack} aria-hidden="true"><span className={styles.switchThumb} /></span>
                        </button>
                    </div>
                : null}
            </div>

            {photos === null ?
                <div className={styles.grid} aria-busy="true" aria-label="Loading photos">
                    {Array.from({ length: 8 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
                </div>

            : loadError ?
                <div className={styles.emptyState}>
                    <p className={styles.emptyTitle}>Couldn&apos;t load your photos</p>
                    <button type="button" className={styles.primaryButton} onClick={() => { setPhotos(null); loadPhotos() }}>Try again</button>
                </div>

            : photos.length === 0 ?
                <div className={styles.emptyLayout}>
                    <div className={styles.grid}>{addTile}</div>
                    <div className={styles.emptyState}>
                        <p className={styles.emptyTitle}>No progress photos yet</p>
                        <p className={styles.emptyBody}>Add one every week or two, in the same spot and lighting, to see how far you&apos;ve come.</p>
                    </div>
                </div>

            :
                monthGroups.map((group, groupIndex) => (
                    <section key={group.label} className={styles.month}>
                        <p className={styles.monthLabel}>
                            {group.label}
                            <span>{group.total} {group.total === 1 ? "photo" : "photos"}</span>
                        </p>
                        <div className={styles.grid}>
                            {groupIndex === 0 ? addTile : null}
                            {group.items.map(({ photo, index }) => (
                                <PhotoTile key={photo.id} photo={photo} blurred={blurPhotos} onOpen={() => setViewerIndex(index)} />
                            ))}
                        </div>
                    </section>
                ))
            }

            {hasMore ?
                <div ref={sentinelRef} className={styles.sentinel}><span className={styles.spinner} /></div>
            : null}

            {isFormVisible ?
                <div className={styles.overlay} {...backdrop(closeUpload)}>
                    <div className={styles.uploadModal} role="dialog" aria-modal="true" aria-label="Add progress photo">
                        <div className={styles.modalHeader}>
                            <p className={styles.modalTitle}>Add progress photo</p>
                            <button type="button" className={styles.iconButton} onClick={closeUpload} aria-label="Close">
                                <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 6L18 18M18 6L6 18" strokeLinecap="round"/></svg>
                            </button>
                        </div>

                        {selectedImageURL ?
                            <>
                                <div className={styles.preview}>
                                    <Image
                                        src={selectedImageURL}
                                        alt="Selected photo preview"
                                        fill
                                        unoptimized
                                        style={{ objectFit: "contain" }}
                                        className={blurPhotos && !previewRevealed ? styles.blurredMedia : undefined}
                                    />
                                    {blurPhotos && !previewRevealed ?
                                        <button type="button" className={styles.revealButton} onClick={() => setPreviewRevealed(true)}>
                                            <EyeIcon /> Show preview
                                        </button>
                                    : null}
                                </div>
                                <div className={styles.modalActions}>
                                    <button type="button" className={styles.secondaryButton} onClick={() => fileInput.current?.click()} disabled={isUploading}>Choose another</button>
                                    <button type="button" className={styles.primaryButton} onClick={handleImageSubmit} disabled={isUploading}>
                                        {isUploading ? <><span className={styles.spinner} /> Uploading…</> : "Upload photo"}
                                    </button>
                                </div>
                            </>
                        :
                            <div
                                className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => fileInput.current?.click()}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click() } }}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                            >
                                <svg width="64" height="64" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M21 27.5625C21.7249 27.5625 22.3125 26.9748 22.3125 26.25V7.04802L25.2536 10.4792C25.7252 11.0295 26.5538 11.0933 27.1042 10.6215C27.6546 10.1498 27.7183 9.3212 27.2465 8.77084L21.9965 2.64584C21.7473 2.35492 21.3831 2.1875 21 2.1875C20.6169 2.1875 20.2528 2.35492 20.0036 2.64584L14.7535 8.77084C14.2818 9.3212 14.3455 10.1498 14.8959 10.6215C15.4462 11.0933 16.2748 11.0295 16.7465 10.4792L19.6875 7.04802V26.25C19.6875 26.9748 20.2752 27.5625 21 27.5625Z" fill="#E20000"/>
                                    <path d="M28 15.75C26.7712 15.75 26.1567 15.75 25.7154 16.0449C25.5243 16.1726 25.3601 16.3367 25.2325 16.5278C24.9375 16.9692 24.9375 17.5836 24.9375 18.8125V26.25C24.9375 28.4246 23.1747 30.1875 21 30.1875C18.8254 30.1875 17.0626 28.4246 17.0626 26.25V18.8125C17.0626 17.5836 17.0626 16.9691 16.7676 16.5277C16.6399 16.3367 16.4759 16.1726 16.2849 16.045C15.8435 15.75 15.229 15.75 14 15.75C9.05025 15.75 6.57538 15.75 5.03769 17.2877C3.5 18.8255 3.5 21.2999 3.5 26.2496V27.9996C3.5 32.9493 3.5 35.4242 5.03769 36.9619C6.57538 38.4996 9.05025 38.4996 14 38.4996H28C32.9497 38.4996 35.4245 38.4996 36.9623 36.9619C38.5 35.4242 38.5 32.9493 38.5 27.9996V26.2496C38.5 21.2999 38.5 18.8255 36.9623 17.2877C35.4245 15.75 32.9497 15.75 28 15.75Z" fill="#E20000"/>
                                </svg>
                                <p className={styles.dropzoneTitle}>{isDragging ? "Drop to add it" : "Select a photo to upload"}</p>
                                <p className={styles.dropzoneBody}>or drag and drop it here · JPG, PNG or WebP up to 10 MB</p>
                                <span className={styles.primaryButton}>Select image</span>
                            </div>
                        }

                        {uploadError ? <p className={styles.uploadError} role="alert">{uploadError}</p> : null}
                    </div>
                </div>
            : null}

            {viewerPhoto && photos ?
                <div className={styles.overlay} {...backdrop(closeViewer)}>
                    <div className={styles.viewer} role="dialog" aria-modal="true" aria-label="Progress photo">
                        <div className={styles.modalHeader}>
                            <div>
                                <p className={styles.modalTitle}>{dayjs(viewerPhoto.created_at).format("MMMM D, YYYY")}</p>
                                <p className={styles.viewerMeta}>Photo {viewerIndex! + 1} of {photos.length}</p>
                            </div>
                            <div className={styles.viewerActions}>
                                {blurPhotos && revealedId === viewerPhoto.id ?
                                    <button type="button" className={styles.iconButton} onClick={() => setRevealedId(null)} aria-label="Blur this photo again">
                                        <EyeOffIcon />
                                    </button>
                                : null}
                                <button type="button" className={`${styles.iconButton} ${styles.deleteIconButton}`} onClick={() => setConfirmDelete(true)} aria-label="Delete photo">
                                    <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 7H20M9 7V4.5C9 4.2 9.2 4 9.5 4H14.5C14.8 4 15 4.2 15 4.5V7M6.5 7L7.4 19.2C7.5 20.2 8.3 21 9.3 21H14.7C15.7 21 16.5 20.2 16.6 19.2L17.5 7M10 11V17M14 11V17" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </button>
                                <button type="button" className={styles.iconButton} onClick={closeViewer} aria-label="Close">
                                    <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 6L18 18M18 6L6 18" strokeLinecap="round"/></svg>
                                </button>
                            </div>
                        </div>

                        <div className={styles.viewerStage} style={{ backgroundImage: `url(${cloudinaryPlaceholder(viewerPhoto.image_link)})` }}>
                            {blurPhotos && revealedId !== viewerPhoto.id ?
                                <>
                                    <Image
                                        key={`${viewerPhoto.id}-blurred`}
                                        src={cloudinaryBlurredFull(viewerPhoto.image_link)}
                                        alt={`Blurred progress photo from ${dayjs(viewerPhoto.created_at).format("MMMM D, YYYY")}`}
                                        fill
                                        unoptimized
                                        className={`${styles.viewerImage} ${styles.blurredMedia}`}
                                    />
                                    <button type="button" className={styles.revealButton} onClick={() => setRevealedId(viewerPhoto.id)}>
                                        <EyeIcon /> Show photo
                                    </button>
                                </>
                            :
                                <Image
                                    key={viewerPhoto.id}
                                    loader={cloudinaryLoader}
                                    src={viewerPhoto.image_link}
                                    alt={`Progress photo from ${dayjs(viewerPhoto.created_at).format("MMMM D, YYYY")}`}
                                    fill
                                    sizes="(max-width: 900px) 100vw, 800px"
                                    priority
                                    className={styles.viewerImage}
                                />
                            }

                            <button type="button" className={`${styles.navButton} ${styles.navPrev}`} onClick={() => showPhoto(-1)} disabled={viewerIndex === 0} aria-label="Newer photo">‹</button>
                            <button type="button" className={`${styles.navButton} ${styles.navNext}`} onClick={() => showPhoto(1)} disabled={viewerIndex === photos.length - 1} aria-label="Older photo">›</button>

                            {confirmDelete ?
                                <div className={styles.confirmDelete}>
                                    <p className={styles.modalTitle}>Delete this photo?</p>
                                    <p className={styles.viewerMeta}>This can&apos;t be undone.</p>
                                    <div className={styles.modalActions}>
                                        <button type="button" className={styles.secondaryButton} onClick={() => setConfirmDelete(false)} disabled={isDeleting}>Cancel</button>
                                        <button type="button" className={styles.primaryButton} onClick={handleDeleteImage} disabled={isDeleting}>
                                            {isDeleting ? <><span className={styles.spinner} /> Deleting…</> : "Delete"}
                                        </button>
                                    </div>
                                </div>
                            : null}
                        </div>
                    </div>
                </div>
            : null}

            <input type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif"
                    ref={fileInput}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
            />
        </div>
    )
}
