"use client";

import { useEffect, useState } from "react";
import styles from "./follows.module.css";
import { setFollow } from "../videos/videoTypes";
import { useRequireSignIn } from "@/app/contexts/viewer";
import VerifyHint from "../verification/VerifyHint";

type FollowButtonProps = {
    username: string,
    following: boolean,
    requested?: boolean, // asked to follow this private profile, waiting on its owner
    onChange?: (following: boolean, followers: number, requested: boolean) => void,
    size?: "small" | "large",
}

type State = "none" | "requested" | "following"

// Follow / Following toggle (hovering "Following" offers to unfollow). Following a private profile sends a
// request instead, shown as "Requested" (hovering offers to take it back) until its owner accepts it.
export default function FollowButton({ username, following, requested = false, onChange, size = "small" }: FollowButtonProps) {
    const [ state, setState ] = useState<State>(following ? "following" : requested ? "requested" : "none")
    const [ busy, setBusy ] = useState(false)
    const [ error, setError ] = useState<string | null>(null)

    const requireSignIn = useRequireSignIn()

    useEffect(() => { setState(following ? "following" : requested ? "requested" : "none") }, [following, requested])

    async function toggle() {
        if (busy || !requireSignIn()) return
        const previous = state
        const on = state === "none"
        // following straight away is the usual answer; a private profile answers with a request instead
        setState(on ? "following" : "none")
        setBusy(true)
        setError(null)
        try {
            const result = await setFollow(username, on)
            setState(result.following ? "following" : result.requested ? "requested" : "none")
            onChange?.(result.following, result.followers, Boolean(result.requested))
        } catch (e) {
            setState(previous)
            setError(e instanceof Error ? e.message : "Couldn't save that")
        } finally {
            setBusy(false)
        }
    }

    const label = { none: `Follow @${username}`, requested: `Cancel follow request to @${username}`, following: `Unfollow @${username}` }[state]

    return (
        <span className={styles.followWrap}>
        <button
            type="button"
            className={`${styles.follow} ${size === "large" ? styles.large : ""} ${state !== "none" ? styles.following : ""}`}
            onClick={toggle}
            disabled={busy}
            aria-pressed={state !== "none"}
            aria-label={label}
        >
            <span className={styles.idle}>{state === "following" ? "Following" : state === "requested" ? "Requested" : "Follow"}</span>
            {state !== "none" ? <span className={styles.hover} aria-hidden="true">{state === "following" ? "Unfollow" : "Cancel"}</span> : null}
        </button>
        {error ?
            <span className={styles.followError} role="alert">
                <VerifyHint message={error} />
            </span>
        : null}
        </span>
    )
}
