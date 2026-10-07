"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./SearchResults.module.css";
import VideoGrid from "../videos/VideoGrid";
import { formatCount } from "../videos/videoTypes";

type ProfileResult = { username: string, name: string, pfp: string | null, privacy: "public" | "private", followers: number, isOwner: boolean }

const TABS = [ { id: "videos", label: "Videos" }, { id: "profiles", label: "Profiles" } ] as const
type Tab = typeof TABS[number]["id"]

// Search results for videos (captions and who posted them) and profiles, under two tabs. The words
// and the tab live in the URL, so results can be shared, refreshed and gone back to.
export default function SearchResults() {
    const params = useSearchParams()
    const router = useRouter()
    const q = (params.get("q") ?? "").trim()
    const tab: Tab = params.get("tab") === "profiles" ? "profiles" : "videos"
    const [ draft, setDraft ] = useState(q)

    useEffect(() => { setDraft(q) }, [q])

    function go(next: { q?: string, tab?: Tab }) {
        const query = new URLSearchParams({ q: next.q ?? q, tab: next.tab ?? tab })
        router.push(`/search?${query}`)
    }

    function submit(e: FormEvent) {
        e.preventDefault()
        const words = draft.trim()
        if (words) go({ q: words })
    }

    return (
        <div className="mainWrapper">
            <div className={styles.page}>
                <form className={styles.searchRow} onSubmit={submit} role="search">
                    <input
                        className={styles.input}
                        type="search"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Search videos and people"
                        aria-label="Search videos and people"
                        maxLength={80}
                        enterKeyHint="search"
                    />
                    <button type="submit" className={styles.submit} disabled={!draft.trim()}>Search</button>
                </form>

                {q ?
                    <>
                        <h1 className={styles.heading}>Results for &ldquo;{q}&rdquo;</h1>
                        <div className={styles.tabs} role="tablist" aria-label="Result type">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="tab"
                                    id={`tab-${t.id}`}
                                    aria-selected={tab === t.id}
                                    aria-controls={`panel-${t.id}`}
                                    className={tab === t.id ? styles.activeTab : styles.tab}
                                    onClick={() => go({ tab: t.id })}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
                            {tab === "videos" ?
                                <VideoGrid key={q} tab="search" search={q} empty={<p className={styles.empty}>No videos match &ldquo;{q}&rdquo;. Try fewer words, or look under Profiles.</p>} />
                            :   <ProfileResults key={q} q={q} />}
                        </div>
                    </>
                :
                    <p className={styles.empty}>Search for videos by caption or creator, or find people by name or username.</p>
                }
            </div>
        </div>
    )
}

function ProfileResults({ q }: { q: string }) {
    const [ profiles, setProfiles ] = useState<ProfileResult[] | null>(null)
    const [ cursor, setCursor ] = useState<string | null>(null)
    const [ error, setError ] = useState<string | null>(null)
    const [ loadingMore, setLoadingMore ] = useState(false)

    async function fetchPage(next: string | null) {
        const res = await fetch(`/api/find?${new URLSearchParams({ q, type: "profiles", ...(next ? { cursor: next } : {}) })}`)
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.message ?? "Couldn't search right now")
        return json as { profiles: ProfileResult[], nextCursor: string | null }
    }

    useEffect(() => {
        let cancelled = false
        fetchPage(null)
            .then((page) => { if (!cancelled) { setProfiles(page.profiles); setCursor(page.nextCursor) } })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't search right now") })
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPage only depends on q
    }, [q])

    async function loadMore() {
        if (!cursor) return
        setLoadingMore(true)
        try {
            const page = await fetchPage(cursor)
            setProfiles((prev) => [...(prev ?? []), ...page.profiles])
            setCursor(page.nextCursor)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't search right now")
        } finally {
            setLoadingMore(false)
        }
    }

    if (error && !profiles) return <p className={styles.empty}>{error}</p>
    if (!profiles) return <span className={styles.spinner} role="status" aria-label="Searching" />
    if (!profiles.length) return <p className={styles.empty}>No one matches &ldquo;{q}&rdquo;.</p>

    return (
        <>
            <ul className={styles.profiles}>
                {profiles.map((p) => (
                    <li key={p.username}>
                        <Link href={p.isOwner ? "/profile" : `/profile/${encodeURIComponent(p.username)}`} className={styles.profile}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- profile pictures can come from Cloudinary or Google */}
                            <img src={p.pfp ?? "/male_default.svg"} alt="" className={styles.avatar} />
                            <span className={styles.who}>
                                <strong>@{p.username}{p.isOwner ? <span className={styles.you}>You</span> : null}</strong>
                                {p.name ? <span>{p.name}</span> : null}
                            </span>
                            <span className={styles.meta}>
                                {formatCount(p.followers)} {p.followers === 1 ? "follower" : "followers"}
                                {p.privacy === "private" ? <span className={styles.badge}>Private</span> : null}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            {cursor ? <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</button> : null}
            {error ? <p className={styles.empty} role="alert">{error}</p> : null}
        </>
    )
}
