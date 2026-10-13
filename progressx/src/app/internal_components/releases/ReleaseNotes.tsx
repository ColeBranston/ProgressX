"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Modal from "../mystats/Modal";
import styles from "./releaseNotes.module.css";
import { Inline, parseReleaseNotes, Release } from "./releases";

function Inlines({ inlines }: { inlines: Inline[] }) {
    return inlines.map((inline, i) =>
        inline.code ? <code key={i}>{inline.text}</code>
        : inline.bold ? <strong key={i}>{inline.text}</strong>
        : <Fragment key={i}>{inline.text}</Fragment>
    )
}

// Shows the newest release's notes (its pull request's title and description) once per user, the first
// time they open the app after it ships. Dismissing it records it as seen on their account.
export default function ReleaseNotes() {
    const [ release, setRelease ] = useState<Release | null>(null)

    useEffect(() => {
        let cancelled = false
        fetch("/api/releases")
            .then((res) => res.ok ? res.json() : null)
            .then((json) => { if (!cancelled && json?.release) setRelease(json.release) })
            .catch(() => {}) // not worth bothering anyone about
        return () => { cancelled = true }
    }, [])

    const blocks = useMemo(() => parseReleaseNotes(release?.body ?? ""), [release])

    if (!release) return null

    function dismiss() {
        if (!release) return
        setRelease(null)
        fetch("/api/releases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seenId: release.id }),
        }).catch((err) => console.error("Couldn't mark the release as seen: ", err))
    }

    return (
        <Modal title={release.title} onClose={dismiss}>
            <p className={styles.eyebrow}>
                New update · {new Date(release.releasedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </p>
            {blocks.length ?
                <div className={styles.notes}>
                    {blocks.map((block, i) =>
                        block.kind === "heading" ? <h3 key={i}><Inlines inlines={block.inlines} /></h3>
                        : block.kind === "list" ? <ul key={i}>{block.items.map((item, j) => <li key={j}><Inlines inlines={item} /></li>)}</ul>
                        : <p key={i}><Inlines inlines={block.inlines} /></p>
                    )}
                </div>
            : null}
            <button type="button" className={styles.gotIt} onClick={dismiss}>Got it</button>
        </Modal>
    )
}
