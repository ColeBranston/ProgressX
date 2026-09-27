"use client";

import { FormEvent, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./settings.module.css";
import { userDataContext, UserData } from "@/app/contexts/userData";
import { formatVolume, getWaterTargetMl } from "@/app/internal_components/index";

type Settings = {
    blurProgressPhotos: boolean,
    waterGoalMl: number | null, // null = recommended
    profilePrivacy: "public" | "private",
}

type Section = "privacy" | "diet"
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
        try {
            for (const key of ["userData", "TotalExpenditure", "user_photos"]) localStorage.removeItem(key)
        } catch { /* storage unavailable */ }
        window.location.href = "/login" // full reload also resets in-memory state
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
