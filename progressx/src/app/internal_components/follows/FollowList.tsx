"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./follows.module.css";
import FollowButton from "./FollowButton";
import { backdrop } from "../a11y";

type Person = { username: string, name: string, pfp: string | null, privacy: "public" | "private", isOwner: boolean, following: boolean }
type List = "followers" | "following"

type FollowListProps = {
    username: string, // "me" for your own lists
    initial: List,
    counts?: { followers: number, following: number },
    onClose: () => void,
    onFollowChange?: () => void, // you followed / unfollowed someone from the list
}

// The people who follow someone, and the people they follow, in a dialog with a tab for each
export default function FollowList({ username, initial, counts, onClose, onFollowChange }: FollowListProps) {
    const [ list, setList ] = useState<List>(initial)
    const [ people, setPeople ] = useState<Person[] | null>(null)
    const [ cursor, setCursor ] = useState<string | null>(null)
    const [ error, setError ] = useState<string | null>(null)
    const [ loadingMore, setLoadingMore ] = useState(false)
    const closeRef = useRef<HTMLButtonElement>(null)

    const fetchPage = useCallback(async (next: string | null) => {
        const query = next ? `?cursor=${encodeURIComponent(next)}` : ""
        const res = await fetch(`/api/profiles/${encodeURIComponent(username)}/${list}${query}`)
        const json = await res.json().catch(() => null)
        if (res.status === 403) throw new Error("This account is private, so its lists are hidden")
        if (!res.ok) throw new Error(json?.message ?? "Couldn't load this list")
        return json as { people: Person[], nextCursor: string | null }
    }, [username, list])

    useEffect(() => {
        let cancelled = false
        setPeople(null)
        setError(null)
        fetchPage(null)
            .then((page) => { if (!cancelled) { setPeople(page.people); setCursor(page.nextCursor) } })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this list") })
        return () => { cancelled = true }
    }, [fetchPage])

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        closeRef.current?.focus()
        function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
        window.addEventListener("keydown", onKey)
        return () => {
            window.removeEventListener("keydown", onKey)
            previouslyFocused?.focus()
        }
    }, [onClose])

    async function loadMore() {
        if (!cursor) return
        setLoadingMore(true)
        try {
            const page = await fetchPage(cursor)
            setPeople((prev) => [...(prev ?? []), ...page.people])
            setCursor(page.nextCursor)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't load this list")
        } finally {
            setLoadingMore(false)
        }
    }

    const tabs: { id: List, label: string, count?: number }[] = [
        { id: "followers", label: "Followers", count: counts?.followers },
        { id: "following", label: "Following", count: counts?.following },
    ]

    return (
        <div className={styles.backdrop} {...backdrop(onClose)}>
            <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={list === "followers" ? "Followers" : "Following"}>
                <div className={styles.header}>
                    <div className={styles.tabs} role="tablist">
                        {tabs.map((tab) => (
                            <button key={tab.id} type="button" role="tab" aria-selected={list === tab.id} className={list === tab.id ? styles.activeTab : styles.tab} onClick={() => setList(tab.id)}>
                                {tab.count !== undefined ? <span>{tab.count}</span> : null}{tab.label}
                            </button>
                        ))}
                    </div>
                    <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close">
                        <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 6L18 18M18 6L6 18" strokeLinecap="round"/></svg>
                    </button>
                </div>

                <div className={styles.body} role="tabpanel">
                    {error && !people ?
                        <p className={styles.empty}>{error}</p>
                    : !people ?
                        <span className={styles.spinner} role="status" aria-label="Loading" />
                    : people.length === 0 ?
                        <p className={styles.empty}>
                            {list === "followers"
                                ? username === "me" ? "No one follows you yet." : "No followers yet."
                                : username === "me" ? "You're not following anyone yet. Find people with the search box." : "Not following anyone yet."}
                        </p>
                    :
                        <ul className={styles.people}>
                            {people.map((person) => (
                                <li key={person.username} className={styles.person}>
                                    <Link href={person.isOwner ? "/profile" : `/profile/${encodeURIComponent(person.username)}`} className={styles.who} onClick={onClose}>
                                        {/* eslint-disable-next-line @next/next/no-img-element -- profile pictures can come from Cloudinary or Google */}
                                        <img src={person.pfp ?? "/male_default.svg"} alt="" />
                                        <span>
                                            <strong>@{person.username}</strong>
                                            {person.name ? <small>{person.name}</small> : null}
                                        </span>
                                    </Link>
                                    {person.isOwner ? <span className={styles.you}>You</span> : <FollowButton username={person.username} following={person.following} onChange={() => onFollowChange?.()} />}
                                </li>
                            ))}
                        </ul>
                    }
                    {cursor ? <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</button> : null}
                    {error && people ? <p className={styles.empty} role="alert">{error}</p> : null}
                </div>
            </div>
        </div>
    )
}
