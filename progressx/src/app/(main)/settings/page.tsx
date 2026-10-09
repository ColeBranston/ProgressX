"use client";

import { FormEvent, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import IdVerification from "../../internal_components/verification/IdVerification";
import styles from "./settings.module.css";
import { userDataContext, UserData } from "@/app/contexts/userData";
import { formatVolume, getWaterTargetMl } from "@/app/internal_components/index";
import { clearLocalAccountData } from "@/app/internal_components/SessionWatch";

type Settings = {
    blurProgressPhotos: boolean,
    waterGoalMl: number | null, // null = recommended
    profilePrivacy: "public" | "private",
    weightUnit: "lb" | "kg",
}

type Section = "privacy" | "diet" | "workouts"
type SaveStatus = { section: Section, state: "saving" | "saved" | "error" } | null

const WATER_GOAL_MIN_ML = 500 // matches user_settings.water_goal_ml
const WATER_GOAL_MAX_ML = 6000

type SwitchProps = { checked: boolean, label: string, onChange: () => void }

function Switch({ checked, label, onChange }: SwitchProps) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`${styles.switch} ${checked ? styles.switchOn : ""}`} onClick={onChange}>
            <span className={styles.switchThumb} />
        </button>
    )
}

type SegmentedProps<T extends string> = {
    label: string,
    value: T,
    options: { value: T, label: string }[],
    onChange: (value: T) => void
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
    return (
        <div className={styles.segmented} role="radiogroup" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    className={value === option.value ? styles.segmentActive : undefined}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

export default function SettingsPage() {
    const { userData, setUserData } = useContext(userDataContext)

    const [ settings, setSettings ] = useState<Settings | null>(null)
    const [ email, setEmail ] = useState<string | null>(null)
    const [ loadError, setLoadError ] = useState(false)
    const [ status, setStatus ] = useState<SaveStatus>(null)

    const [ waterMode, setWaterMode ] = useState<"recommended" | "custom">("recommended")
    const [ waterInput, setWaterInput ] = useState("")
    const [ waterError, setWaterError ] = useState<string | null>(null)

    const [ loggingOut, setLoggingOut ] = useState(false)

    const [ exporting, setExporting ] = useState(false)
    const [ exportError, setExportError ] = useState(false)
    const [ showDelete, setShowDelete ] = useState(false)
    const [ deleteInput, setDeleteInput ] = useState("")
    const [ deleting, setDeleting ] = useState(false)
    const [ deleteError, setDeleteError ] = useState<string | null>(null)

    const recommendedWaterMl = getWaterTargetMl({ weightLbs: userData.weight, gender: userData.gender, activity: userData.activity })

    const loadSettings = useCallback(async () => {
        setLoadError(false)
        try {
            const res = await fetch("/api/user/settings")
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setSettings(json.settings)
            setEmail(json.email)
            setWaterMode(json.settings.waterGoalMl ? "custom" : "recommended")
            if (json.settings.waterGoalMl) setWaterInput(String(json.settings.waterGoalMl))
        } catch (err) {
            console.error("Failed to load settings: ", err)
            setLoadError(true)
        }
    }, [])

    useEffect(() => {
        loadSettings()
    }, [loadSettings])

    // "Saved" fades after a moment; errors stay until the next change
    useEffect(() => {
        if (status?.state !== "saved") return
        const timer = setTimeout(() => setStatus(null), 2000)
        return () => clearTimeout(timer)
    }, [status])

    // Applies the change right away, saves it, and puts the old value back if saving fails
    async function save(section: Section, patch: Partial<Settings>) {
        if (!settings) return
        const previous = settings
        setSettings({ ...settings, ...patch })
        setStatus({ section, state: "saving" })

        try {
            const res = await fetch("/api/user/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch)
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setSettings(json.settings)
            setStatus({ section, state: "saved" })
            return true
        } catch (err) {
            console.error("Failed to save settings: ", err)
            setSettings(previous)
            setStatus({ section, state: "error" })
            return false
        }
    }

    async function changeVisibility(value: "public" | "private") {
        if (!settings || value === settings.profilePrivacy) return
        const saved = await save("privacy", { profilePrivacy: value })
        // keep the profile page's lock icon in sync
        if (saved) setUserData((prev: UserData) => ({ ...prev, privacy: value }))
    }

    function changeWaterMode(mode: "recommended" | "custom") {
        setWaterMode(mode)
        setWaterError(null)
        if (mode === "recommended") {
            if (settings?.waterGoalMl !== null) save("diet", { waterGoalMl: null })
        } else if (!waterInput) {
            setWaterInput(String(recommendedWaterMl))
        }
    }

    function submitWaterGoal(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const goal = Math.round(Number(waterInput))
        if (!Number.isFinite(goal) || goal < WATER_GOAL_MIN_ML || goal > WATER_GOAL_MAX_ML) {
            setWaterError(`Enter a goal from ${WATER_GOAL_MIN_ML.toLocaleString()} to ${WATER_GOAL_MAX_ML.toLocaleString()} ml.`)
            return
        }
        setWaterError(null)
        setWaterInput(String(goal))
        save("diet", { waterGoalMl: goal })
    }

    async function logOut() {
        setLoggingOut(true)
        try {
            await fetch("/api/auth/logout", { method: "POST" })
        } catch (err) {
            console.error("Logout request failed: ", err)
        }
        // clear this account's data kept in the browser so the next person on this device doesn't see it
        clearLocalAccountData()
        window.location.href = "/login" // full reload also resets in-memory state
    }

    async function downloadData() {
        setExporting(true)
        setExportError(false)
        try {
            const res = await fetch("/api/user/export")
            if (!res.ok) throw new Error(`status ${res.status}`)
            const blob = await res.blob()
            const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "progressx-data.json"
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = name
            link.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error("Failed to export data: ", err)
            setExportError(true)
        } finally {
            setExporting(false)
        }
    }

    async function deleteAccount(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setDeleting(true)
        setDeleteError(null)
        try {
            const res = await fetch("/api/user/account", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmEmail: deleteInput }),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok) throw new Error(json?.message ?? `status ${res.status}`)
            clearLocalAccountData()
            window.location.href = "/login" // full reload also resets in-memory state
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : "Couldn't delete your account, please try again")
            setDeleting(false)
        }
    }

    function statusText(section: Section) {
        if (status?.section !== section) return null
        const text = status.state === "saving" ? "Saving…" : status.state === "saved" ? "Saved" : "Couldn't save, try again"
        return <span className={`${styles.status} ${status.state === "error" ? styles.statusError : ""}`} role="status">{text}</span>
    }

    return (
        <div className={`mainWrapper ${styles.settingsWrapper}`}>
            <div className={styles.page}>
                <div className={styles.content}>
                    <header className={styles.header}>
                        <h1 className={styles.title}>Settings</h1>
                        <p className={styles.subtitle}>Privacy, goals and your account</p>
                    </header>

                    {loadError ?
                        <section className={styles.card}>
                            <p className={styles.rowLabel}>Couldn&apos;t load your settings</p>
                            <button type="button" className={styles.primaryButton} onClick={loadSettings}>Try again</button>
                        </section>

                    : !settings ?
                        <>
                            <div className={styles.skeleton} />
                            <div className={styles.skeleton} />
                            <div className={styles.skeleton} />
                        </>

                    :
                        <>
                            <section className={styles.card} aria-labelledby="privacy-heading">
                                <div className={styles.cardHeader}>
                                    <h2 id="privacy-heading" className={styles.cardTitle}>Privacy</h2>
                                    {statusText("privacy")}
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Blur progress photos</p>
                                        <p className={styles.rowDescription}>Blurs your progress photos on your profile, so you can look at it in public. You can still reveal one photo at a time.</p>
                                    </div>
                                    <Switch
                                        checked={settings.blurProgressPhotos}
                                        label="Blur progress photos"
                                        onChange={() => save("privacy", { blurProgressPhotos: !settings.blurProgressPhotos })}
                                    />
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Profile visibility</p>
                                        <p className={styles.rowDescription}>
                                            {settings.profilePrivacy === "public" ? "Anyone on ProgressX can see your profile." : "Only you can see your profile."}
                                        </p>
                                    </div>
                                    <Segmented
                                        label="Profile visibility"
                                        value={settings.profilePrivacy}
                                        options={[{ value: "private", label: "Private" }, { value: "public", label: "Public" }]}
                                        onChange={changeVisibility}
                                    />
                                </div>
                            </section>

                            <section className={styles.card} aria-labelledby="diet-heading">
                                <div className={styles.cardHeader}>
                                    <h2 id="diet-heading" className={styles.cardTitle}>Diet</h2>
                                    {statusText("diet")}
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Daily water goal</p>
                                        <p className={styles.rowDescription}>
                                            Recommended for you: {formatVolume(recommendedWaterMl)}, based on your weight and activity level.
                                        </p>
                                    </div>
                                    <Segmented
                                        label="Daily water goal"
                                        value={waterMode}
                                        options={[{ value: "recommended", label: "Recommended" }, { value: "custom", label: "Custom" }]}
                                        onChange={changeWaterMode}
                                    />
                                </div>

                                {waterMode === "custom" ?
                                    <form className={styles.inlineForm} onSubmit={submitWaterGoal} noValidate>
                                        <div className={styles.inputWrap}>
                                            <input
                                                className={styles.input}
                                                type="number"
                                                inputMode="numeric"
                                                min={WATER_GOAL_MIN_ML}
                                                max={WATER_GOAL_MAX_ML}
                                                step={50}
                                                value={waterInput}
                                                onChange={(e) => setWaterInput(e.target.value)}
                                                aria-label="Custom daily water goal in millilitres"
                                            />
                                            <span className={styles.inputUnit}>ml</span>
                                        </div>
                                        <button
                                            type="submit"
                                            className={styles.primaryButton}
                                            disabled={Number(waterInput) === settings.waterGoalMl}
                                        >
                                            {settings.waterGoalMl && Number(waterInput) === settings.waterGoalMl ? "Saved" : "Save goal"}
                                        </button>
                                        {waterError ? <p className={styles.fieldError} role="alert">{waterError}</p> : null}
                                    </form>
                                : null}
                            </section>

                            <section className={styles.card} aria-labelledby="workouts-heading">
                                <div className={styles.cardHeader}>
                                    <h2 id="workouts-heading" className={styles.cardTitle}>Workouts</h2>
                                    {statusText("workouts")}
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Weight unit</p>
                                        <p className={styles.rowDescription}>How weights are shown and entered on the Workouts tab. Past sets convert automatically.</p>
                                    </div>
                                    <Segmented
                                        label="Weight unit"
                                        value={settings.weightUnit}
                                        options={[{ value: "lb", label: "lb" }, { value: "kg", label: "kg" }]}
                                        onChange={(value) => { if (value !== settings.weightUnit) save("workouts", { weightUnit: value }) }}
                                    />
                                </div>
                            </section>

                            <section className={styles.card} aria-labelledby="account-heading">
                                <div className={styles.cardHeader}>
                                    <h2 id="account-heading" className={styles.cardTitle}>Account</h2>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Email</p>
                                        <p className={styles.rowDescription}>{email ?? "Not available"}</p>
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Log out</p>
                                        <p className={styles.rowDescription}>Signs you out on this device and clears your profile from this browser.</p>
                                    </div>
                                    <button type="button" className={styles.dangerButton} onClick={logOut} disabled={loggingOut}>
                                        {loggingOut ? "Logging out…" : "Log out"}
                                    </button>
                                </div>
                            </section>

                            <IdVerification />

                            <section className={styles.card} aria-labelledby="data-heading">
                                <div className={styles.cardHeader}>
                                    <h2 id="data-heading" className={styles.cardTitle}>Your data</h2>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Download my data</p>
                                        <p className={styles.rowDescription}>A copy of everything ProgressX stores about you: profile, diet, water and workout logs, photo links and your consent history.</p>
                                        {exportError ? <p className={styles.fieldError} role="alert">Couldn&apos;t prepare your data, please try again.</p> : null}
                                    </div>
                                    <button type="button" className={styles.primaryButton} onClick={downloadData} disabled={exporting}>
                                        {exporting ? "Preparing…" : "Download"}
                                    </button>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.rowText}>
                                        <p className={styles.rowLabel}>Delete account</p>
                                        <p className={styles.rowDescription}>Permanently deletes your account, your ID, all of your photos and videos, and every log. This can&apos;t be undone.</p>
                                    </div>
                                    {!showDelete ?
                                        <button type="button" className={styles.dangerButton} onClick={() => setShowDelete(true)}>Delete account</button>
                                    : null}
                                </div>

                                {showDelete ?
                                    <form className={styles.inlineForm} onSubmit={deleteAccount}>
                                        <p className={styles.rowDescription} style={{ flexBasis: "100%", maxWidth: "none" }}>
                                            To confirm, type your email address <strong>{email}</strong>. Consider downloading your data first.
                                        </p>
                                        <div className={styles.inputWrap}>
                                            <input
                                                className={styles.input}
                                                style={{ width: 240 }}
                                                type="email"
                                                autoComplete="off"
                                                value={deleteInput}
                                                onChange={(e) => setDeleteInput(e.target.value)}
                                                aria-label="Type your email address to confirm account deletion"
                                                disabled={deleting}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            className={styles.dangerButton}
                                            disabled={deleting || deleteInput.trim().toLowerCase() !== (email ?? "").trim().toLowerCase()}
                                        >
                                            {deleting ? "Deleting…" : "Permanently delete"}
                                        </button>
                                        <button type="button" className={styles.primaryButton} onClick={() => { setShowDelete(false); setDeleteInput(""); setDeleteError(null) }} disabled={deleting}>
                                            Cancel
                                        </button>
                                        {deleteError ? <p className={styles.fieldError} role="alert">{deleteError}</p> : null}
                                    </form>
                                : null}
                            </section>

                            <section className={styles.card} aria-labelledby="legal-heading">
                                <div className={styles.cardHeader}>
                                    <h2 id="legal-heading" className={styles.cardTitle}>Legal</h2>
                                </div>
                                <Link href="/privacy" className={styles.linkRow}>Privacy Policy <span aria-hidden="true">›</span></Link>
                                <Link href="/terms" className={styles.linkRow}>Terms of Service <span aria-hidden="true">›</span></Link>
                            </section>
                        </>
                    }
                </div>
            </div>
        </div>
    )
}
