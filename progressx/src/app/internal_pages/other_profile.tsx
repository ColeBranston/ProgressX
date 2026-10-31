"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./profile.module.css"
import VideoGrid from "../internal_components/videos/VideoGrid";
import videoStyles from "../internal_components/profile/VideosComponent.module.css"
import FollowButton from "../internal_components/follows/FollowButton";
import { useViewer } from "../contexts/viewer";
import FollowList from "../internal_components/follows/FollowList";
import SharedTracking from "../internal_components/profile/SharedTracking";
import ProfileSkeleton from "../internal_components/profile/ProfileSkeleton";
import sharedStyles from "../internal_components/profile/SharedTracking.module.css";
import { SHARE_KINDS, SHARE_OPTIONS, ShareKind, Sharing } from "../internal_components/profile/sharing";

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
    youFollow: boolean,
    requested?: boolean, // asked to follow this private profile, waiting on them
    canSee?: boolean, // their videos: anyone for a public profile, approved followers for a private one
    followsYou: boolean,
    listsVisible: boolean,
    shared: Sharing, // what they show this viewer besides videos (only signed-in viewers of public profiles)
}

// Another person's profile. Their name, picture, bio and counts are always shown; their videos when their
// profile is public, or to the followers they approved when it's private; plus a tab for each kind of
// tracking they chose to show this viewer (progress photos, weight, workouts, diet). Liked and favourite
// videos stay private to each person.
export default function OtherProfile({ username }: { username: string }) {
    const router = useRouter()
    const [ profile, setProfile ] = useState<PublicProfile | null>(null)
    const [ error, setError ] = useState<string | null>(null)
    const { signedIn } = useViewer()
    const [ followList, setFollowList ] = useState<"followers" | "following" | null>(null)
    const [ tab, setTab ] = useState<"videos" | ShareKind>("videos")

    useEffect(() => {
        let cancelled = false
        setProfile(null)
        setError(null)
        setTab("videos")
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
                            <Link href={signedIn ? "/" : "/explore"} className={styles.privateLink}>Back to For You</Link>
                        </div>
                    : <ProfileSkeleton />}
                </div>
            </div>
        )
    }

    const isPrivate = profile.privacy === "private"
    const tabs: { key: "videos" | ShareKind, label: string }[] = [
        { key: "videos", label: "Videos" },
        ...SHARE_KINDS.filter((kind) => profile.shared?.[kind]).map((kind) => ({ key: kind, label: SHARE_OPTIONS[kind].label })),
    ]

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
                            <FollowButton
                                size="large"
                                username={profile.username}
                                following={profile.youFollow}
                                requested={profile.requested}
                                onChange={(youFollow, followers, requested) => setProfile((prev) => (prev ? { ...prev, youFollow, followers, requested } : prev))}
                            />
                            {profile.followsYou ? <span className={styles.privacyBadge}>Follows you</span> : null}
                        </div>
                        <div className={styles.profileInfoRow}>
                            {profile.listsVisible ?
                                <>
                                    <button type="button" className={`${styles.profileStatsContainer} ${styles.profileStatsButton}`} onClick={() => setFollowList("following")}><span className={styles.profileStatsText}>{profile.following}</span>Following</button>
                                    <button type="button" className={`${styles.profileStatsContainer} ${styles.profileStatsButton}`} onClick={() => setFollowList("followers")}><span className={styles.profileStatsText}>{profile.followers}</span>Followers</button>
                                </>
                            :
                                <>
                                    <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.following}</span>Following</p>
                                    <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.followers}</span>Followers</p>
                                </>
                            }
                            <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.likes}</span>Likes</p>
                            {profile.videos !== null ? <p className={styles.profileStatsContainer}><span className={styles.profileStatsText}>{profile.videos}</span>Videos</p> : null}
                        </div>
                        <div className={styles.profileInfoRow}>
                            <p className={styles.bioText}>{profile.bio || "No Bio Yet"}</p>
                        </div>
                    </div>
                </div>
                <div className={sharedStyles.tabs} role="tablist" aria-label={`@${profile.username}'s profile`}>
                    {tabs.map((t) => (
                        <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls="profile-tab-panel"
                            className={sharedStyles.tab} onClick={() => setTab(t.key)}>
                            {t.label}
                        </button>
                    ))}
                </div>
                {followList ?
                    <FollowList
                        username={profile.username}
                        initial={followList}
                        counts={{ followers: profile.followers, following: profile.following }}
                        onClose={() => setFollowList(null)}
                    />
                : null}
                <div className={styles.selectedContentContainer} role="tabpanel" id="profile-tab-panel" aria-labelledby={`tab-${tab}`}>
                    {tab !== "videos" ?
                        <SharedTracking key={tab} username={profile.username} kind={tab} />
                    : isPrivate && !(profile.canSee ?? false) ?
                        <div className={styles.privateNotice}>
                            <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
                                <path d="M12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V10C17.7956 10 18.5587 10.3161 19.1213 10.8787C19.6839 11.4413 20 12.2044 20 13V19C20 19.7956 19.6839 20.5587 19.1213 21.1213C18.5587 21.6839 17.7956 22 17 22H7C6.20435 22 5.44129 21.6839 4.87868 21.1213C4.31607 20.5587 4 19.7956 4 19V13C4 12.2044 4.31607 11.4413 4.87868 10.8787C5.44129 10.3161 6.20435 10 7 10V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2ZM12 14C11.4954 13.9998 11.0094 14.1904 10.6395 14.5335C10.2695 14.8766 10.0428 15.3468 10.005 15.85L10 16C10 16.3956 10.1173 16.7822 10.3371 17.1111C10.5568 17.44 10.8692 17.6964 11.2346 17.8478C11.6001 17.9991 12.0022 18.0387 12.3902 17.9616C12.7781 17.8844 13.1345 17.6939 13.4142 17.4142C13.6939 17.1345 13.8844 16.7781 13.9616 16.3902C14.0387 16.0022 13.9991 15.6001 13.8478 15.2346C13.6964 14.8692 13.44 14.5568 13.1111 14.3371C12.7822 14.1173 12.3956 14 12 14ZM12 4C11.2044 4 10.4413 4.31607 9.87868 4.87868C9.31607 5.44129 9 6.20435 9 7V10H15V7C15 6.20435 14.6839 5.44129 14.1213 4.87868C13.5587 4.31607 12.7956 4 12 4Z"/>
                            </svg>
                            <p className={styles.usernameText}>This account is private</p>
                            <p className={styles.bioText}>
                                {profile.requested
                                    ? `Your follow request is waiting for @${profile.username} to accept it.`
                                    : `Follow @${profile.username} to ask to see their videos. They'll need to accept your request.`}
                            </p>
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
