"use client";

import { useEffect, useState } from "react";
import styles from './VideosComponent.module.css'
import shared from './ProgressPhotos.module.css'
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import VideoGrid from "../videos/VideoGrid";
import VideoUploadForm from "../videos/VideoUploadForm";

// Your own videos tab: the "Add new video" tile opens the upload form (also opened by
// /profile?videoSubmit=true, e.g. from the For You page), then your videos newest first
export default function VideosComponent() {

    const params = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const [ isFormVisible, setIsFormVisible ] = useState(false)
    const [ refreshKey, setRefreshKey ] = useState(0)

    useEffect(()=> {
        if (params.get("videoSubmit") === "true") {
            setIsFormVisible(true)
            // drop the flag so a refresh doesn't reopen the form
            const rest = new URLSearchParams(params)
            rest.delete("videoSubmit")
            router.replace(rest.size ? `${pathname}?${rest}` : pathname)
        }
    }, [params, pathname, router])

    return (
        <div className={styles.videosContainer}>
            <VideoGrid
                user="me"
                tab="videos"
                refreshKey={refreshKey}
                leading={
                    // same tile as "Add photo" on the Progress Photos tab
                    <button type="button" className={shared.addTile} onClick={() => setIsFormVisible(true)}>
                        <svg width="36" height="36" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M8 3.3125V12.6875M12.6875 8H3.3125" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>Add video</span>
                    </button>
                }
                empty={<>Your videos show up here. Public profiles also show them in For You.</>}
            />

            {isFormVisible ?
                <VideoUploadForm
                    onClose={() => setIsFormVisible(false)}
                    onUploaded={() => setRefreshKey((k) => k + 1)}
                />
            : null}
        </div>
    )
}
