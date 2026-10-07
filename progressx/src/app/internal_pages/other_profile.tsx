"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./profile.module.css"
import VideoGrid from "../internal_components/videos/VideoGrid";
import videoStyles from "../internal_components/profile/VideosComponent.module.css"

type PublicProfile = {
    username: string,
    name: string,
    pfp: string | null,
    bio: string,
    privacy: "public" | "private",
    followers: number,
    following: number,
    likes: number,
    videos: number | null,
    isOwner: boolean,
}

// Another person's profile. Their name, picture, bio and counts are always shown; their videos only
// when their profile is public. Liked and favourite videos stay private to each person.
export default function OtherProfile({ username }: { username: string }) {
    const router = useRouter()
    const [ profile, setProfile ] = useState<PublicProfile | null>(null)
    const [ error, setError ] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setProfile(null)
        setError(null)
        fetch(`/api/profiles/${encodeURIComponent(username)}`)
            .then(async (res) => {
                const json = await res.json().catch(() => null)
                if (cancelled) return
                if (res.status === 404) return setError("This profile doesn't exist")
                if (!res.ok) throw new Error(json?.message)
                if (json.profile.isOwner) return router.replace("/profile")
                setProfile(json.profile)
            })
            .catch(() => { if (!cancelled) setError("Couldn't load this profile") })
        return () => { cancelled = true }
    }, [username, router])

    if (error || !profile) {
        return (
            <div className="mainWrapper">
                <div className={styles.mainContainer}>
                    {error ?
                        <div className={styles.privateNotice}>
                            <p className={styles.usernameText}>{error}</p>
                            <Link href="/" className={styles.privateLink}>Back to For You</Link>
                        </div>
                    : <span className={styles.profileSpinner} role="status" aria-label="Loading profile" />}
                </div>
            </div>
        )
    }

    const isPrivate = profile.privacy === "private"

    return (
        <div className="mainWrapper">
            <div className={styles.mainContainer}>
                <div className={styles.profileHeaderContainer}>
                    <div className={styles.profilePhotoContainer}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- profile pictures can come from Cloudinary or Google */}
                        <img src={profile.pfp ?? "/male_default.svg"} alt={`@${profile.username}'s profile picture`} className={styles.profileImage} />
                    </div>
                    <div className={styles.profileInfoContainer}>
                        <div className={styles.profileInfoRow}>
                            <p className={styles.usernameText}>{profile.username}</p>
                            <span className={styles.privacyBadge}>{isPrivate ? "Private" : "Public"}</span>
                            {profile.name ? <p className={styles.nameText}>{profile.name}</p> : null}
                        </div>
                        <div className={styles.profileInfoRow}>
                            <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.following}</span>Following</p>
                            <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.followers}</span>Followers</p>
                            <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.likes}</span>Likes</p>
                            {profile.videos !== null ? <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.videos}</span>Videos</p> : null}
                        </div>
                        <div className={styles.profileInfoRow}>
                            <p className={styles.bioText}>{profile.bio || "No Bio Yet"}</p>
                        </div>
                    </div>
                </div>
                <ul className={styles.selectorsList}>
                    <li className={styles.activeSelector}>
                        <svg width="30" height="30" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M1.3335 2.66667C1.3335 2.29848 1.63198 2 2.00016 2H14.0002C14.3684 2 14.6668 2.29848 14.6668 2.66667V13.3333C14.6668 13.7015 14.3684 14 14.0002 14H2.00016C1.63198 14 1.3335 13.7015 1.3335 13.3333V2.66667ZM2.66683 3.33333V12.6667H13.3335V3.33333H2.66683ZM4.00016 4.66667H7.3335V7.33333H4.00016V4.66667ZM7.3335 8.66667H4.00016V11.3333H7.3335V8.66667ZM8.66683 4.66667H12.0002V7.33333H8.66683V4.66667ZM12.0002 8.66667H8.66683V11.3333H12.0002V8.66667Z"/>
                        </svg>
                        <p>Videos</p>
                    </li>
                    <div className={styles.firstPosition}></div>
                </ul>
                <div className={styles.selectedContentContainer}>
                    {isPrivate ?
                        <div className={styles.privateNotice}>
                            <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
                                <path d="M12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V10C17.7956 10 18.5587 10.3161 19.1213 10.8787C19.6839 11.4413 20 12.2044 20 13V19C20 19.7956 19.6839 20.5587 19.1213 21.1213C18.5587 21.6839 17.7956 22 17 22H7C6.20435 22 5.44129 21.6839 4.87868 21.1213C4.31607 20.5587 4 19.7956 4 19V13C4 12.2044 4.31607 11.4413 4.87868 10.8787C5.44129 10.3161 6.20435 10 7 10V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2ZM12 14C11.4954 13.9998 11.0094 14.1904 10.6395 14.5335C10.2695 14.8766 10.0428 15.3468 10.005 15.85L10 16C10 16.3956 10.1173 16.7822 10.3371 17.1111C10.5568 17.44 10.8692 17.6964 11.2346 17.8478C11.6001 17.9991 12.0022 18.0387 12.3902 17.9616C12.7781 17.8844 13.1345 17.6939 13.4142 17.4142C13.6939 17.1345 13.8844 16.7781 13.9616 16.3902C14.0387 16.0022 13.9991 15.6001 13.8478 15.2346C13.6964 14.8692 13.44 14.5568 13.1111 14.3371C12.7822 14.1173 12.3956 14 12 14ZM12 4C11.2044 4 10.4413 4.31607 9.87868 4.87868C9.31607 5.44129 9 6.20435 9 7V10H15V7C15 6.20435 14.6839 5.44129 14.1213 4.87868C13.5587 4.31607 12.7956 4 12 4Z"/>
                            </svg>
                            <p className={styles.usernameText}>This account is private</p>
                            <p className={styles.bioText}>@{profile.username} only shares their videos when their profile is public.</p>
                        </div>
                    :
                        <div className={videoStyles.videosContainer}>
                            <VideoGrid user={profile.username} tab="videos" empty={<p className={styles.bioText}>@{profile.username} hasn&apos;t posted any videos yet.</p>} />
                        </div>
                    }
                </div>
            </div>
        </div>
    )
}
