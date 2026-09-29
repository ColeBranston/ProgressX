"use client";

import { FormEvent, useState } from "react";
import styles from "../login/page.module.css";
import consentStyles from "./consent.module.css";
import ConsentChecks, { ConsentState, consentPayload } from "@/app/internal_components/legal/ConsentChecks";

// Shown (by the middleware) to anyone signed in who hasn't agreed to the current terms + privacy
// policy: a first Google sign-in, an account from before consent was recorded, or after the terms change.
export default function ConsentPage() {
    const [ consent, setConsent ] = useState<ConsentState>({ confirmedAge: false, acceptedTerms: false })
    const [ saving, setSaving ] = useState(false)
    const [ error, setError ] = useState<string | null>(null)

    async function agree(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (!consent.confirmedAge || !consent.acceptedTerms) return
        setSaving(true)
        setError(null)
        try {
            const res = await fetch("/api/user/consent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(consentPayload(consent)),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok) throw new Error(json?.message ?? `status ${res.status}`)
            // full navigation so the middleware routes to onboarding or the app
            window.location.href = "/"
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save your agreement, please try again")
            setSaving(false)
        }
    }

    async function decline() {
        try {
            await fetch("/api/auth/logout", { method: "POST" })
        } catch { /* cookies are cleared server-side when reachable */ }
        try {
            localStorage.removeItem("userData")
        } catch { /* storage unavailable */ }
        window.location.href = "/login"
    }

    return (
        <div className={styles.mainContainer}>
            <div className="mainLogo">
                <span className="progress">Progress</span>
                <span className="X">X</span>
            </div>
            <form className={`${styles.loginFormContainer} ${consentStyles.card}`} onSubmit={agree}>
                <h1 className={consentStyles.title}>Before you continue</h1>
                <p className={consentStyles.text}>
                    ProgressX stores health and fitness information you choose to add, like your body measurements, food and water logs,
                    workouts and progress photos. Please confirm your age and review how we handle it.
                </p>
                <ConsentChecks value={consent} onChange={setConsent} />
                {error ? <p className={consentStyles.error} role="alert">{error}</p> : null}
                <button className={styles.submitButton} type="submit" disabled={saving || !consent.confirmedAge || !consent.acceptedTerms}>
                    {saving ? "Saving…" : "Agree and continue"}
                </button>
                <button type="button" className={consentStyles.decline} onClick={decline} disabled={saving}>
                    I don&apos;t agree, log me out
                </button>
            </form>
        </div>
    )
}
