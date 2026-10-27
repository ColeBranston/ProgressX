"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import dayjs from "dayjs";
import styles from "./ProgressPhotos.module.css";
import { cloudinaryBlurredFull, cloudinaryLoader, cloudinaryPlaceholder } from "./cloudinaryImage";
import { backdrop } from "../a11y";
import { beforeAndAfter, timeApart } from "./photoCompare";
import type { ProgressPhoto } from "./ProgressPhotosComponent";

type ComparePhotosProps = {
    first: ProgressPhoto,
    second: ProgressPhoto,
    blurred: boolean,   // the "Blur photos" setting: both stay blurred until shown
    onChange: () => void,  // pick different photos
    onClose: () => void,
}

// Two progress photos side by side, older on the left, with their dates and the time between them
export default function ComparePhotos({ first, second, blurred, onChange, onClose }: ComparePhotosProps) {
    const [ before, after ] = beforeAndAfter(first, second)
    const [ revealed, setRevealed ] = useState(false)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    const hidden = blurred && !revealed

    return (
        <div className={styles.overlay} {...backdrop(onClose)}>
            <div className={`${styles.viewer} ${styles.compareViewer}`} role="dialog" aria-modal="true" aria-label="Compare progress photos">
                <div className={styles.modalHeader}>
                    <div>
                        <p className={styles.modalTitle}>Compare</p>
                        <p className={styles.viewerMeta}>{timeApart(before.created_at, after.created_at)}</p>
                    </div>
                    <div className={styles.viewerActions}>
                        {blurred && revealed ?
                            <button type="button" className={styles.secondaryButton} onClick={() => setRevealed(false)}>Blur again</button>
                        : null}
                        <button type="button" className={styles.secondaryButton} onClick={onChange}>Change photos</button>
                        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
                            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 6L18 18M18 6L6 18" strokeLinecap="round"/></svg>
                        </button>
                    </div>
                </div>

                <div className={styles.compareStage}>
                    {[ { photo: before, label: "Before" }, { photo: after, label: "After" } ].map(({ photo, label }) => {
                        const date = dayjs(photo.created_at).format("MMMM D, YYYY")
                        return (
                            <figure key={photo.id} className={styles.compareSide}>
                                <div className={styles.compareImage} style={{ backgroundImage: `url(${cloudinaryPlaceholder(photo.image_link)})` }}>
                                    {hidden ?
                                        // only the pre-blurred version is loaded until the photos are shown
                                        <Image src={cloudinaryBlurredFull(photo.image_link)} alt={`Blurred progress photo from ${date}`} fill unoptimized className={`${styles.viewerImage} ${styles.blurredMedia}`} />
                                    :
                                        <Image loader={cloudinaryLoader} src={photo.image_link} alt={`Progress photo from ${date}`} fill sizes="(max-width: 900px) 50vw, 600px" className={styles.viewerImage} />
                                    }
                                </div>
                                <figcaption className={styles.compareCaption}><span>{label}</span>{date}</figcaption>
                            </figure>
                        )
                    })}
                    {hidden ?
                        <button type="button" className={styles.revealButton} onClick={() => setRevealed(true)}>Show photos</button>
                    : null}
                </div>
            </div>
        </div>
    )
}
