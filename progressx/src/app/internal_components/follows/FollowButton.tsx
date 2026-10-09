"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./follows.module.css";
import { setFollow } from "../videos/videoTypes";

type FollowButtonProps = {
    username: string,
    following: boolean,
    onChange?: (following: boolean, followers: number) => void,
    size?: "small" | "large",
}

// Follow / Following toggle (hovering "Following" offers to unfollow)
export default function FollowButton({ username, following, onChange, size = "small" }: FollowButtonProps) {
    const [ on, setOn ] = useState(following)
    const [ busy, setBusy ] = useState(false)
    const [ error, setError ] = useState<string | null>(null)

    useEffect(() => { setOn(following) }, [following])

    async function toggle() {
        if (busy) return
        const next = !on
        setOn(next)
        setBusy(true)
        setError(null)
        try {
            const result = await setFollow(username, next)
            setOn(result.following)
            onChange?.(result.following, result.followers)
        } catch (e) {
            setOn(!next)
            setError(e instanceof Error ? e.message : "Couldn't save that")
        } finally {
            setBusy(false)
        }
    }

    return (
        <span className={styles.followWrap}>
        <button
            type="button"
            className={`${styles.follow} ${size === "large" ? styles.large : ""} ${on ? styles.following : ""}`}
            onClick={toggle}
            disabled={busy}
            aria-pressed={on}
            aria-label={on ? `Unfollow @${username}` : `Follow @${username}`}
        >
            <span className={styles.idle}>{on ? "Following" : "Follow"}</span>
            {on ? <span className={styles.hover} aria-hidden="true">Unfollow</span> : null}
        </button>
        {error ?
            <span className={styles.followError} role="alert">
                {error}{error.startsWith("Verify your ID") ? <> <Link href="/settings#verification">Verify now</Link></> : null}
            </span>
        : null}
        </span>
    )
}
