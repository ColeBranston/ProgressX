"use client";

import { Suspense } from "react";
import styles from "../page.module.css";
import ForYouFeed from "../../internal_components/videos/ForYouFeed";

// Videos from the people you follow, newest first (same player as For You)
export default function FollowingPage() {
    return (
        <div className="mainWrapper">
            <div className={styles.videoPlayerContainer}>
                <Suspense><ForYouFeed source="following" /></Suspense>
            </div>
        </div>
    )
}
