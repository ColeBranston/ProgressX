"use client";

import EmptyComponentGraphic from './EmptyComponentGraphic'
import VideoGrid from '../videos/VideoGrid'
import styles from './VideosComponent.module.css'

// Videos you've liked (only you can see this list)
export default function LikedVideosComponent() {

    return (
        <div className={styles.videosContainer}>
            <VideoGrid user="me" tab="liked" empty={<EmptyComponentGraphic text="Like videos you see and they will show up here" />} />
        </div>
    )
}
