"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./onboarding.module.css";
import {
    ACTIVITY_LEVELS,
    AGE_RANGE,
    CM_PER_INCH,
    FieldErrors,
    GENDERS,
    Gender,
    LB_PER_KG,
    NAME_MAX,
    OnboardingDetails,
    usernameError,
    validateOnboarding,
} from "@/app/internal_components/profile/profileRules";

// New accounts land here (the middleware sends anyone who hasn't finished it) after agreeing to the
// terms. Three short steps; nothing is saved until the end.

const STEPS = [
    { title: "About you", fields: ["name", "username"] },
    { title: "Your body", fields: ["age", "gender", "heightCm", "weightLbs"] },
    { title: "Activity", fields: ["activity"] },
] as const satisfies readonly { title: string, fields: readonly (keyof OnboardingDetails)[] }[]

type UsernameCheck = { state: "idle" | "checking" | "available" | "taken" | "error", message?: string }

export default function Onboarding() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [step, setStep] = useState(0)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [errors, setErrors] = useState<FieldErrors>({})
    const [touched, setTouched] = useState<Partial<Record<keyof OnboardingDetails, boolean>>>({})

    const [name, setName] = useState("")
    const [username, setUsername] = useState("")
    const [age, setAge] = useState("")
    const [gender, setGender] = useState<Gender | "">("")
    const [heightUnit, setHeightUnit] = useState<"ft" | "cm">("ft")
    const [feet, setFeet] = useState("")
    const [inches, setInches] = useState("")
    const [centimetres, setCentimetres] = useState("")
    const [weightUnit, setWeightUnit] = useState<"lb" | "kg">("lb")
    const [weight, setWeight] = useState("")
    const [activity, setActivity] = useState<number | null>(null)
    const [usernameCheck, setUsernameCheck] = useState<UsernameCheck>({ state: "idle" })
    const headingRef = useRef<HTMLHeadingElement>(null)

    // who's signing up (shown for reassurance; the middleware already made sure they're logged in)
    useEffect(() => {
        fetch("/api/auth").then((res) => res.ok ? res.json() : null).then((json) => {
            if (json?.user) setEmail(json.user)
        }).catch(() => {})
    }, [])

    // move focus to the new step's heading so screen readers and keyboards follow along
    useEffect(() => { headingRef.current?.focus() }, [step])

    const heightCm = heightUnit === "cm"
        ? Number(centimetres)
        : (Number(feet) * 12 + Number(inches || 0)) * CM_PER_INCH
    const weightLbs = weightUnit === "lb" ? Number(weight) : Number(weight) * LB_PER_KG

    const details: OnboardingDetails = useMemo(() => ({
        name, username: username.trim(), age: Number(age), gender: gender as Gender,
        heightCm: (heightUnit === "cm" ? centimetres : feet) === "" ? NaN : heightCm,
        weightLbs: weight === "" ? NaN : weightLbs,
        activity: activity ?? NaN,
    }), [name, username, age, gender, heightUnit, centimetres, feet, heightCm, weight, weightLbs, activity])

    const liveErrors = useMemo(() => validateOnboarding(details), [details])

    // editing a field clears the error shown for it (live checks take over from there)
    const clearError = (field: keyof OnboardingDetails) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
    useEffect(() => clearError("name"), [name])
    useEffect(() => clearError("username"), [username])
    useEffect(() => clearError("age"), [age])
    useEffect(() => clearError("gender"), [gender])
    useEffect(() => clearError("heightCm"), [feet, inches, centimetres, heightUnit])
    useEffect(() => clearError("weightLbs"), [weight, weightUnit])
    useEffect(() => clearError("activity"), [activity])
    const shownError = (field: keyof OnboardingDetails) => (touched[field] ? errors[field] ?? liveErrors[field] : errors[field])

    // live username availability, after a short pause in typing
    useEffect(() => {
        const value = username.trim()
        if (!value || usernameError(value)) {
            setUsernameCheck({ state: "idle" })
            return
        }
        setUsernameCheck({ state: "checking" })
        const controller = new AbortController()
        const timer = window.setTimeout(async () => {
            try {
                const res = await fetch(`/api/user/onboarding?username=${encodeURIComponent(value)}`, { signal: controller.signal })
                const json = await res.json()
                if (!res.ok) return setUsernameCheck({ state: "error" })
                setUsernameCheck(json.available ? { state: "available" } : { state: "taken", message: json.message })
            } catch (err) {
                if ((err as Error).name !== "AbortError") setUsernameCheck({ state: "error" })
            }
        }, 400)
        return () => {
            controller.abort()
            window.clearTimeout(timer)
        }
    }, [username])

    function touch(field: keyof OnboardingDetails) {
        setTouched((prev) => ({ ...prev, [field]: true }))
        setErrors((prev) => ({ ...prev, [field]: undefined }))
    }

    // Show the problems on this step; returns whether it's good to go
    function checkStep(index: number) {
        const fields = STEPS[index].fields
        const stepErrors: FieldErrors = {}
        for (const field of fields) if (liveErrors[field]) stepErrors[field] = liveErrors[field]
        if (index === 0 && usernameCheck.state === "taken") stepErrors.username = usernameCheck.message ?? "That username is taken"
        setTouched((prev) => ({ ...prev, ...Object.fromEntries(fields.map((f) => [f, true])) }))
        setErrors((prev) => ({ ...prev, ...stepErrors }))
        return Object.keys(stepErrors).length === 0
    }

    async function submit(event: FormEvent) {
        event.preventDefault()
        setFormError(null)
        if (step < STEPS.length - 1) {
            if (checkStep(step)) setStep(step + 1)
            return
        }
        if (!checkStep(step)) return

        setSaving(true)
        try {
            const res = await fetch("/api/user/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...details, weightUnit }),
            })
            const json = await res.json().catch(() => ({}))
            if (res.ok) {
                router.replace("/")
                return
            }
            if (res.status === 401) {
                window.location.href = "/login?expired=1"
                return
            }
            const serverErrors: FieldErrors = json.errors ?? {}
            setErrors(serverErrors)
            // jump back to the first step with a problem
            const firstStep = STEPS.findIndex((s) => s.fields.some((f) => serverErrors[f]))
            if (firstStep >= 0) setStep(firstStep)
            setFormError(json.message ?? "Couldn't save your details. Please try again.")
        } catch {
            setFormError("Couldn't reach ProgressX. Check your connection and try again.")
        }
        setSaving(false)
    }

    const describe = (field: keyof OnboardingDetails) => (shownError(field) ? `${field}-error` : undefined)
    const fieldError = (field: keyof OnboardingDetails) => shownError(field)
        ? <p id={`${field}-error`} className={styles.fieldError} role="alert">{shownError(field)}</p>
        : null

    return (
        <div className={styles.page}>
            <div className={styles.glow} aria-hidden="true" />
            <main className={styles.shell}>
                <header className={styles.header}>
                    <p className={styles.welcome}>Welcome to</p>
                    <div className={`mainLogo ${styles.logo}`} aria-label="ProgressX">
                        <span className="progress">Progress</span>
                        <span className="X">X</span>
                    </div>
                    <p className={styles.lead}>A few details so your calorie, macro and water targets fit you. It takes about a minute.</p>
                    {email ? <p className={styles.signedIn}>Signed in as <strong>{email}</strong></p> : null}
                </header>

                <ol className={styles.progress} aria-label="Steps">
                    {STEPS.map((s, i) => (
                        <li key={s.title} className={i < step ? styles.stepDone : i === step ? styles.stepCurrent : ""} aria-current={i === step ? "step" : undefined}>
                            <span className={styles.stepBar} />
                            <span className={styles.stepLabel}>{i + 1}. {s.title}</span>
                        </li>
                    ))}
                </ol>

                <form className={styles.card} onSubmit={submit} noValidate>
                    <h1 ref={headingRef} tabIndex={-1} className={styles.cardTitle}>{STEPS[step].title}</h1>

                    {step === 0 ?
                        <div className={styles.fields} key="step0">
                            <div className={styles.field}>
                                <label htmlFor="name">Name</label>
                                <input id="name" className={styles.input} value={name} maxLength={NAME_MAX} autoComplete="name" placeholder="Your name"
                                    onChange={(e) => setName(e.target.value)} onBlur={() => touch("name")} aria-invalid={Boolean(shownError("name"))} aria-describedby={describe("name")} />
                                {fieldError("name")}
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="username">Username</label>
                                <div className={styles.inputAffix}>
                                    <span aria-hidden="true">@</span>
                                    <input id="username" className={styles.input} value={username} maxLength={20} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="yourname"
                                        onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} onBlur={() => touch("username")}
                                        aria-invalid={Boolean(shownError("username") || usernameCheck.state === "taken")} aria-describedby="username-status" />
                                </div>
                                <p id="username-status" className={shownError("username") || usernameCheck.state === "taken" ? styles.fieldError : styles.fieldHint} aria-live="polite">
                                    {shownError("username")
                                        ?? (usernameCheck.state === "checking" ? "Checking…"
                                            : usernameCheck.state === "available" ? "✓ Available"
                                            : usernameCheck.state === "taken" ? usernameCheck.message
                                            : "3–20 letters, numbers, _ or .")}
                                </p>
                            </div>
                        </div>
                    : step === 1 ?
                        <div className={styles.fields} key="step1">
                            <div className={styles.field}>
                                <label htmlFor="age">Age</label>
                                <input id="age" className={`${styles.input} ${styles.short}`} inputMode="numeric" value={age} placeholder={String(AGE_RANGE[0] + 7)}
                                    onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={() => touch("age")} aria-invalid={Boolean(shownError("age"))} aria-describedby={describe("age")} />
                                {fieldError("age")}
                            </div>

                            <fieldset className={styles.field}>
                                <legend>Sex</legend>
                                <div className={styles.chips} role="radiogroup" aria-describedby="gender-hint">
                                    {GENDERS.map((g) => (
                                        <button key={g.value} type="button" role="radio" aria-checked={gender === g.value} className={styles.chip}
                                            onClick={() => { setGender(g.value); touch("gender") }}>{g.label}</button>
                                    ))}
                                </div>
                                <p id="gender-hint" className={styles.fieldHint}>Used only to estimate your calorie needs.</p>
                                {fieldError("gender")}
                            </fieldset>

                            <fieldset className={styles.field}>
                                <div className={styles.legendRow}>
                                    <legend>Height</legend>
                                    <UnitToggle label="Height unit" options={[["ft", "ft / in"], ["cm", "cm"]]} value={heightUnit} onChange={(u) => {
                                        // carry the value across so switching units doesn't lose it
                                        if (u === "cm" && feet) setCentimetres(String(Math.round(heightCm)))
                                        if (u === "ft" && centimetres) {
                                            const totalInches = Number(centimetres) / CM_PER_INCH
                                            setFeet(String(Math.floor(totalInches / 12)))
                                            setInches(String(Math.round(totalInches % 12)))
                                        }
                                        setHeightUnit(u as "ft" | "cm")
                                    }} />
                                </div>
                                {heightUnit === "ft" ?
                                    <div className={styles.row}>
                                        <div className={styles.inputUnit}>
                                            <input aria-label="Feet" className={styles.input} inputMode="numeric" value={feet} placeholder="5"
                                                onChange={(e) => setFeet(e.target.value.replace(/\D/g, "").slice(0, 1))} onBlur={() => touch("heightCm")} aria-invalid={Boolean(shownError("heightCm"))} aria-describedby={describe("heightCm")} />
                                            <span>ft</span>
                                        </div>
                                        <div className={styles.inputUnit}>
                                            <input aria-label="Inches" className={styles.input} inputMode="numeric" value={inches} placeholder="10"
                                                onChange={(e) => {
                                                    const digits = e.target.value.replace(/\D/g, "").slice(0, 2)
                                                    setInches(digits === "" ? "" : String(Math.min(11, Number(digits))))
                                                }} onBlur={() => touch("heightCm")} />
                                            <span>in</span>
                                        </div>
                                    </div>
                                :
                                    <div className={styles.inputUnit}>
                                        <input aria-label="Height in centimetres" className={styles.input} inputMode="numeric" value={centimetres} placeholder="178"
                                            onChange={(e) => setCentimetres(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={() => touch("heightCm")} aria-invalid={Boolean(shownError("heightCm"))} aria-describedby={describe("heightCm")} />
                                        <span>cm</span>
                                    </div>
                                }
                                {fieldError("heightCm")}
                            </fieldset>

                            <fieldset className={styles.field}>
                                <div className={styles.legendRow}>
                                    <legend>Weight</legend>
                                    <UnitToggle label="Weight unit" options={[["lb", "lb"], ["kg", "kg"]]} value={weightUnit} onChange={(u) => {
                                        if (weight) setWeight(String(Math.round(u === "kg" ? Number(weight) / LB_PER_KG : Number(weight) * LB_PER_KG)))
                                        setWeightUnit(u as "lb" | "kg")
                                    }} />
                                </div>
                                <div className={styles.inputUnit}>
                                    <input aria-label={`Weight in ${weightUnit}`} className={styles.input} inputMode="decimal" value={weight} placeholder={weightUnit === "lb" ? "175" : "80"}
                                        onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} onBlur={() => touch("weightLbs")} aria-invalid={Boolean(shownError("weightLbs"))} aria-describedby={describe("weightLbs")} />
                                    <span>{weightUnit}</span>
                                </div>
                                {fieldError("weightLbs")}
                            </fieldset>
                        </div>
                    :
                        <div className={styles.fields} key="step2">
                            <fieldset className={styles.field}>
                                <legend>How active are you?</legend>
                                <div className={styles.activityList} role="radiogroup" aria-describedby={describe("activity")}>
                                    {ACTIVITY_LEVELS.map((level) => (
                                        <button key={level.value} type="button" role="radio" aria-checked={activity === level.value} className={styles.activity}
                                            onClick={() => { setActivity(level.value); touch("activity") }}>
                                            <span className={styles.activityMeter} aria-hidden="true">
                                                {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= level.value ? styles.meterOn : ""} />)}
                                            </span>
                                            <span className={styles.activityText}>
                                                <strong>{level.label}</strong>
                                                <span>{level.detail}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                {fieldError("activity")}
                            </fieldset>
                            <p className={styles.fieldHint}>You can change any of this later in your profile and settings.</p>
                        </div>
                    }

                    {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}

                    <div className={styles.actions}>
                        {step > 0 ? <button type="button" className={styles.secondary} onClick={() => { setFormError(null); setStep(step - 1) }} disabled={saving}>Back</button> : <span />}
                        <button type="submit" className={styles.primary} disabled={saving}>
                            {saving ? "Saving…" : step < STEPS.length - 1 ? "Continue" : "Start tracking"}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    )
}

function UnitToggle({ label, options, value, onChange }: { label: string, options: [string, string][], value: string, onChange: (value: string) => void }) {
    return (
        <div className={styles.unitToggle} role="radiogroup" aria-label={label}>
            {options.map(([option, text]) => (
                <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => value !== option && onChange(option)}>{text}</button>
            ))}
        </div>
    )
}
