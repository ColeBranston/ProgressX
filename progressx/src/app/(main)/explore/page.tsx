import type { Metadata } from "next";
import { Suspense } from "react";
import styles from "../page.module.css";
import ForYouFeed from "../../internal_components/videos/ForYouFeed";

export const metadata: Metadata = {
    title: "Explore fitness videos | ProgressX",
    description: "Workouts, lifts, runs and meals from the ProgressX community. Watch without an account.",
    alternates: { canonical: "/explore" },
};

// The public feed: the same For You videos (public profiles only), for anyone, signed in or not
export default function ExplorePage() {
    return (
        <div className="mainWrapper">
            <div className={styles.videoPlayerContainer}>
                <Suspense><ForYouFeed /></Suspense>
            </div>
        </div>
    )
}
