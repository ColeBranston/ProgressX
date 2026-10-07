"use client";

import EmptyComponentGraphic from './EmptyComponentGraphic'
import VideoGrid from '../videos/VideoGrid'
import styles from './VideosComponent.module.css'

// Videos you've bookmarked (only you can see this list)
export default function FavouriteVideosComponent() {

    return (
        <div className={styles.videosContainer}>
            <VideoGrid user="me" tab="favourites" empty={<EmptyComponentGraphic text="Favourite videos you see and they will show up here" />} />
        </div>
    )
}
