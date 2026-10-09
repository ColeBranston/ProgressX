"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import settings from "../../(main)/settings/settings.module.css";
import shared from "../profile/ProgressPhotos.module.css";
import styles from "./IdVerification.module.css";
import { backdrop } from "../a11y";

type Status = {
    state: "verified" | "expired" | "rejected" | "none",
    documentType: "passport" | "drivers_licence" | "id_card" | null,
    issuingCountry: string | null,
    expiresOn: string | null,
    verifiedAt: string | null,
    reason: string | null,
}

const DOCUMENT_NAMES = { passport: "passport", drivers_licence: "driver's licence", id_card: "ID card" } as const
const MAX_SIDE = 2000

// Shrinks a photo in the browser before it's sent (smaller upload, no camera metadata); the server
// re-encodes it again anyway. Falls back to the original file if the browser can't decode it (HEIC).
async function shrink(file: File): Promise<Blob> {
    try {
        const bitmap = await createImageBitmap(file)
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(bitmap.width * scale)
        canvas.height = Math.round(bitmap.height * scale)
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        bitmap.close()
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
        canvas.width = canvas.height = 0
        return blob ?? file
    } catch {
        return file
    }
}

// Settings > Identity verification: the current status, and the dialog to verify, replace or remove
export default function IdVerification() {
    const [ status, setStatus ] = useState<Status | null>(null)
    const [ available, setAvailable ] = useState(true)
    const [ loadError, setLoadError ] = useState(false)
    const [ open, setOpen ] = useState(false)
    const [ confirmRemove, setConfirmRemove ] = useState(false)
    const [ removing, setRemoving ] = useState(false)
    const [ notice, setNotice ] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/verification", { cache: "no-store" })
            if (!res.ok) throw new Error()
            const json = await res.json()
            setStatus(json.status)
            setAvailable(json.available !== false)
            setLoadError(false)
        } catch {
            setLoadError(true)
        }
    }, [])

    useEffect(() => { load() }, [load])

    async function remove() {
        setRemoving(true)
        setNotice(null)
        try {
            const res = await fetch("/api/verification", { method: "DELETE" })
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Couldn't remove your ID")
            setConfirmRemove(false)
            setNotice("Your ID has been removed.")
            await load()
        } catch (e) {
            setNotice(e instanceof Error ? e.message : "Couldn't remove your ID")
        } finally {
            setRemoving(false)
        }
    }

    const doc = status?.documentType ? DOCUMENT_NAMES[status.documentType] : "document"
    const description = !status
        ? (loadError ? "Couldn't load your verification." : "Loading…")
        : status.state === "verified"
            ? `Verified with your ${doc}${status.issuingCountry ? ` (${status.issuingCountry})` : ""} on ${dayjs(status.verifiedAt).format("MMM D, YYYY")}. Valid until ${dayjs(status.expiresOn).format("MMM D, YYYY")}.`
            : status.state === "expired"
                ? `Your ${doc} expired on ${dayjs(status.expiresOn).format("MMM D, YYYY")}. Verify again with a valid one to keep posting, liking and following.`
                : status.state === "rejected"
                    ? `Your last try didn't pass: ${status.reason ?? "the document couldn't be checked."}`
                    : "Verify with a passport, or a driver's licence or provincial ID card, to post videos, like, favourite and follow. It's how we keep bots out."

    return (
        <section className={settings.card} aria-labelledby="verification-heading" id="verification">
            <div className={settings.cardHeader}>
                <h2 id="verification-heading" className={settings.cardTitle}>Identity verification</h2>
            </div>

            <div className={settings.row}>
                <div className={settings.rowText}>
                    <p className={settings.rowLabel}>
                        {status?.state === "verified" ? <span className={styles.verifiedBadge}>✓ Verified</span> : status?.state === "expired" ? <span className={styles.warnBadge}>Expired</span> : "Government ID"}
                    </p>
                    <p className={settings.rowDescription}>{description}</p>
                    {!available ? <p className={settings.fieldError}>ID verification isn&apos;t available yet.</p> : null}
                    {notice ? <p className={settings.rowDescription} role="status">{notice}</p> : null}
                </div>
                {status && available ?
                    <div className={styles.actions}>
                        <button type="button" className={settings.primaryButton} onClick={() => { setNotice(null); setOpen(true) }}>
                            {status.state === "verified" ? "Replace" : "Verify ID"}
                        </button>
                        {status.state === "verified" || status.state === "expired" ?
                            <button type="button" className={settings.dangerButton} onClick={() => setConfirmRemove(true)} disabled={removing}>Remove</button>
                        : null}
                    </div>
                : null}
            </div>

            {confirmRemove ?
                <div className={settings.inlineForm}>
                    <p className={settings.rowDescription} style={{ flexBasis: "100%", maxWidth: "none" }}>
                        This permanently deletes your stored ID photos. You won&apos;t be able to post videos, like, favourite or follow until you verify again.
                    </p>
                    <button type="button" className={settings.dangerButton} onClick={remove} disabled={removing}>{removing ? "Removing…" : "Remove my ID"}</button>
                    <button type="button" className={settings.primaryButton} onClick={() => setConfirmRemove(false)} disabled={removing}>Cancel</button>
                </div>
            : null}

            <div className={settings.row}>
                <div className={settings.rowText}>
                    <p className={settings.rowLabel}>How your ID is protected</p>
                    <p className={settings.rowDescription}>
                        It&apos;s checked automatically on ProgressX&apos;s own server; it&apos;s never sent to another company to check.
                        A copy is kept encrypted with a key of its own and is never shown on the site, not even to you.
                        Only whether you&apos;re verified, the document type, country and expiry date are kept readable.
                        Removing it here, or deleting your account, deletes the copy.
                    </p>
                </div>
            </div>

            {open ? <VerifyDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); setNotice("You're verified."); load() }} /> : null}
        </section>
    )
}

type Slot = { file: File, url: string } | null

function VerifyDialog({ onClose, onDone }: { onClose: () => void, onDone: () => void }) {
    const [ kind, setKind ] = useState<"passport" | "card">("passport")
    const [ front, setFront ] = useState<Slot>(null)
    const [ back, setBack ] = useState<Slot>(null)
    const [ agreed, setAgreed ] = useState(false)
    const [ busy, setBusy ] = useState(false)
    const [ progress, setProgress ] = useState<string | null>(null)
    const [ error, setError ] = useState<string | null>(null)
    const frontInput = useRef<HTMLInputElement>(null)
    const backInput = useRef<HTMLInputElement>(null)
    const slots = useRef<{ front: Slot, back: Slot }>({ front: null, back: null })
    slots.current = { front, back }

    // previews only live in this dialog; they're released when it closes
    useEffect(() => () => {
        if (slots.current.front) URL.revokeObjectURL(slots.current.front.url)
        if (slots.current.back) URL.revokeObjectURL(slots.current.back.url)
    }, [])

    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !busy) onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [busy, onClose])

    function pick(which: "front" | "back") {
        return (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (!file) return
            if (file.type && !file.type.startsWith("image/")) return setError("Choose a photo (JPG, PNG, WebP or HEIC).")
            if (file.size > 25 * 1024 * 1024) return setError("That photo is over 25 MB.")
            setError(null)
            const slot = { file, url: URL.createObjectURL(file) }
            if (which === "front") { if (front) URL.revokeObjectURL(front.url); setFront(slot) }
            else { if (back) URL.revokeObjectURL(back.url); setBack(slot) }
        }
    }

    async function submit() {
        if (!front || (kind === "card" && !back) || !agreed) return
        setBusy(true)
        setError(null)
        setProgress("Uploading securely")
        try {
            const form = new FormData()
            form.append("kind", kind)
            form.append("consent", agreed ? "yes" : "no")
            form.append("front", await shrink(front.file), "front.jpg")
            if (kind === "card" && back) form.append("back", await shrink(back.file), "back.jpg")
            const res = await fetch("/api/verification", { method: "POST", body: form })
            if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.message ?? "Couldn't check your document")

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            let result: { ok: boolean, reason?: string } | null = null
            for (;;) {
                const { value, done } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() ?? ""
                for (const line of lines.filter(Boolean)) {
                    const event = JSON.parse(line)
                    if (event.type === "status") setProgress(event.text)
                    if (event.type === "result") result = event
                }
            }
            if (!result) throw new Error("The check didn't finish. Try again.")
            if (!result.ok) throw new Error(result.reason ?? "Your document didn't pass the check")
            onDone()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't check your document")
            setProgress(null)
            setBusy(false)
        }
    }

    const ready = Boolean(front && (kind === "passport" || back) && agreed)

    const slot = (which: "front" | "back", value: Slot, label: string, hint: string) => (
        <button type="button" className={`${styles.slot} ${value ? styles.slotFilled : ""}`} onClick={() => (which === "front" ? frontInput : backInput).current?.click()} disabled={busy}>
            {value ?
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen photo (a blob: URL)
                <img src={value.url} alt="" />
            : <span className={styles.slotIcon} aria-hidden="true">+</span>}
            <span className={styles.slotLabel}>{value ? `Change ${label.toLowerCase()}` : label}</span>
            {!value ? <span className={styles.slotHint}>{hint}</span> : null}
        </button>
    )

    return (
        <div className={shared.overlay} {...backdrop(() => { if (!busy) onClose() })}>
            <div className={`${shared.uploadModal} ${styles.dialog}`} role="dialog" aria-modal="true" aria-label="Verify your ID">
                <div className={shared.modalHeader}>
                    <p className={shared.modalTitle}>Verify your ID</p>
                    <button type="button" className={shared.iconButton} onClick={onClose} disabled={busy} aria-label="Close">
                        <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 6L18 18M18 6L6 18" strokeLinecap="round"/></svg>
                    </button>
                </div>

                <div className={styles.kinds} role="radiogroup" aria-label="Document">
                    <button type="button" role="radio" aria-checked={kind === "passport"} className={kind === "passport" ? styles.kindOn : styles.kind} onClick={() => setKind("passport")} disabled={busy}>Passport</button>
                    <button type="button" role="radio" aria-checked={kind === "card"} className={kind === "card" ? styles.kindOn : styles.kind} onClick={() => setKind("card")} disabled={busy}>Driver&apos;s licence or ID card</button>
                </div>

                <div className={styles.slots}>
                    {slot("front", front, kind === "passport" ? "Photo page" : "Front", kind === "passport" ? "The page with your photo and the two lines of code" : "The side with your photo")}
                    {kind === "card" ? slot("back", back, "Back", "The side with the barcode") : null}
                </div>
                <p className={styles.tips}>Lay it flat in good light, fill the frame, no glare or fingers over it.</p>

                <label className={styles.consent}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={busy} />
                    <span>
                        I agree that ProgressX checks this document automatically and keeps an encrypted copy until I remove it
                        or delete my account, as described in the <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>.
                    </span>
                </label>

                {progress ? <p className={styles.progress} role="status"><span className={shared.spinner} /> {progress}… (this can take a minute)</p> : null}
                {error ? <p className={shared.uploadError} role="alert">{error}</p> : null}

                <div className={shared.modalActions}>
                    <button type="button" className={shared.secondaryButton} onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className={shared.primaryButton} onClick={submit} disabled={!ready || busy}>
                        {busy ? <><span className={shared.spinner} /> Checking…</> : "Verify"}
                    </button>
                </div>

                <input ref={frontInput} type="file" accept="image/*" capture="environment" onChange={pick("front")} hidden />
                <input ref={backInput} type="file" accept="image/*" capture="environment" onChange={pick("back")} hidden />
            </div>
        </div>
    )
}
