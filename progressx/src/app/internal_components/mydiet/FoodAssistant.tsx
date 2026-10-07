"use client";

import { useEffect, useRef, useState } from 'react'
import styles from './FoodAssistant.module.css'
import NumberField from './NumberField'
import { MICRONUTRIENT_DEFS } from './microNutrients'
import { FoodItemFormValues } from './FoodItemForm'

// Mirrors api/libs/dietAssistant.ts (that file is server-only)
type Nutrition = {
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
    fiberG: number
    micronutrients: Record<string, number>
}

export type FoodProposal = {
    name: string
    amount: string
    // how far to trust it, and how the numbers were worked out (written by the server)
    accuracy: "high" | "medium" | "low"
    explanation: string[]
    basis: "database" | "link" | "pasted" | "ai_overview" | "search" | "estimate"
    sourceLabel: string
    matchedName: string | null
    // nutrition for one serving option = base x its multiplier
    base: Nutrition
    options: { label: string, multiplier: number }[]
    optionIndex: number
    quantity: number
    sources: { title: string, link: string }[]
}

type NewItem =
    | { kind: "user" | "assistant" | "status" | "error", text: string, photo?: string }
    | { kind: "proposal", proposal: FoodProposal }
type Item = NewItem & { id: number }

type FoodAssistantProps = {
    // the day being logged to, so "today" means the same thing to the assistant
    dateKey: string
    // resolves true once the food is logged
    onAdd: (values: FoodItemFormValues, opts: { saveToCatalog: boolean }) => Promise<boolean>
}

const SUGGESTIONS = [
    "About a bowl of beef stew",
    "2 slices of pepperoni pizza",
    "A big plate of spaghetti with meat sauce",
]

// replies are shown as plain text; tidy the bits of markdown small models add anyway
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^[ \t]*[*-][ \t]+/gm, "• ")

const ACCURACY_LABEL: Record<FoodProposal["accuracy"], string> = {
    high: "High accuracy",
    medium: "Medium accuracy",
    low: "Low accuracy",
}

// Photos are shrunk and re-encoded in the browser before they're sent: a fresh JPEG drawn from the
// pixels (no metadata or anything else from the original file), small enough for a quick upload.
// The server checks and re-encodes it again; this just keeps uploads small.
const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024
const PHOTO_MAX_SIDE = 1600
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]

async function preparePhoto(file: File): Promise<string> {
    if (!PHOTO_TYPES.includes(file.type)) throw new Error("Choose a JPG, PNG or WebP photo.")
    if (file.size > MAX_PHOTO_FILE_BYTES) throw new Error("That photo is too big (20 MB max).")
    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file)
    } catch {
        throw new Error("Couldn't open that photo. Try a JPG or PNG.")
    }
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Couldn't process that photo.")
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL("image/jpeg", 0.85)
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places

function scale(base: Nutrition, factor: number): Nutrition {
    const micronutrients: Record<string, number> = {}
    for (const [name, value] of Object.entries(base.micronutrients)) micronutrients[name] = round(value * factor)
    return {
        calories: round(base.calories * factor, 0),
        proteinG: round(base.proteinG * factor, 1),
        carbsG: round(base.carbsG * factor, 1),
        fatsG: round(base.fatsG * factor, 1),
        fiberG: round(base.fiberG * factor, 1),
        micronutrients,
    }
}

type ProposalCardProps = {
    proposal: FoodProposal
    active: boolean
    onAdd: FoodAssistantProps["onAdd"]
    onRefine: () => void
}

// The confirm step: nothing is logged until the user presses Add
function ProposalCard({ proposal, active, onAdd, onRefine }: ProposalCardProps) {
    const [quantity, setQuantity] = useState(proposal.quantity)
    const [optionIndex, setOptionIndex] = useState(proposal.optionIndex)
    const [saveToCatalog, setSaveToCatalog] = useState(false)
    const [showMicros, setShowMicros] = useState(false)
    const [adding, setAdding] = useState(false)
    const [added, setAdded] = useState(false)
    const [failed, setFailed] = useState(false)

    const option = proposal.options[optionIndex] ?? proposal.options[0]
    const isGrams = option.label === "g"
    const totals = scale(proposal.base, option.multiplier * quantity)
    // fibre already has its own tile
    const micros = MICRONUTRIENT_DEFS.filter((def) => def.name !== "Fibre" && totals.micronutrients[def.name])
    const fieldId = `amount-${proposal.name.replace(/\W+/g, "-")}-${proposal.quantity}`

    // switching between grams and a portion keeps the same amount of food
    function changeOption(next: number) {
        const grams = option.multiplier * quantity
        const nextMultiplier = proposal.options[next].multiplier
        setOptionIndex(next)
        setQuantity(round(grams / nextMultiplier, proposal.options[next].label === "g" ? 0 : 2))
    }

    async function add() {
        setAdding(true)
        setFailed(false)
        try {
            const ok = await onAdd({
                name: proposal.name,
                servingQty: quantity,
                servingUnit: isGrams ? "g" : `× ${option.label}`,
                calories: totals.calories,
                proteinG: totals.proteinG,
                carbsG: totals.carbsG,
                fatsG: totals.fatsG,
                fiberG: totals.fiberG,
                micronutrients: totals.micronutrients,
            }, { saveToCatalog })
            setAdded(ok)
            setFailed(!ok)
        } finally {
            setAdding(false)
        }
    }

    const editable = active && !added
    return (
        <div className={`${styles.proposal} ${active || added ? "" : styles.proposalStale} ${added ? styles.proposalAdded : ""}`}>
            <div className={styles.proposalHead}>
                <p className={styles.proposalName}>{proposal.name}</p>
                <span className={`${styles.basis} ${proposal.basis === "estimate" ? styles.basisEstimate : ""}`}>{proposal.sourceLabel}</span>
            </div>
            {proposal.matchedName ? <p className={styles.matched}>Matched: {proposal.matchedName}</p> : null}

            <div className={styles.servings}>
                <label htmlFor={fieldId}>Amount</label>
                {editable ?
                    <div className={styles.servingsField}>
                        <NumberField id={fieldId} min={0} step={isGrams ? 10 : 0.25} value={quantity} onChange={setQuantity} />
                    </div>
                : <strong>{quantity}</strong>}
                {editable && proposal.options.length > 1 ?
                    <select className={styles.unitSelect} value={optionIndex} onChange={(e) => changeOption(Number(e.target.value))} aria-label="Serving size">
                        {proposal.options.map((o, i) => <option key={`${o.label}-${i}`} value={i}>{o.label === "g" ? "grams" : `× ${o.label}`}</option>)}
                    </select>
                : <span>{isGrams ? "g" : `× ${option.label}`}</span>}
            </div>

            <div className={styles.totals}>
                <div className={styles.total}><span>{totals.calories}</span><small>kcal</small></div>
                <div className={styles.total}><span>{totals.proteinG}g</span><small>protein</small></div>
                <div className={styles.total}><span>{totals.carbsG}g</span><small>carbs</small></div>
                <div className={styles.total}><span>{totals.fatsG}g</span><small>fat</small></div>
                <div className={styles.total}><span>{totals.fiberG}g</span><small>fibre</small></div>
            </div>

            {micros.length > 0 ?
                <>
                    <button type="button" className={styles.linkButton} onClick={() => setShowMicros(!showMicros)} aria-expanded={showMicros}>
                        {showMicros ? "Hide" : "Show"} {micros.length} {micros.length === 1 ? "micronutrient" : "micronutrients"}
                    </button>
                    {showMicros ?
                        <ul className={styles.micros}>
                            {micros.map((def) => (
                                <li key={def.name}><span>{def.name}</span><span>{totals.micronutrients[def.name]} {def.measure}</span></li>
                            ))}
                        </ul>
                    : null}
                </>
            : proposal.basis === "ai_overview" || proposal.basis === "search" ? <p className={styles.muted}>Google didn&apos;t list micronutrients for this food.</p> : null}

            <div className={styles.how}>
                <p className={`${styles.accuracy} ${styles[`accuracy_${proposal.accuracy}`]}`}>
                    <i aria-hidden="true" />{ACCURACY_LABEL[proposal.accuracy]}
                </p>
                <ul>
                    {proposal.explanation.map((line) => <li key={line}>{line}</li>)}
                </ul>
            </div>

            {proposal.sources.length > 0 ?
                <p className={styles.sources}>
                    Sources: {proposal.sources.map((source, i) => (
                        <span key={source.link}>{i > 0 ? ", " : ""}<a href={source.link} target="_blank" rel="noopener noreferrer">{source.title}</a></span>
                    ))}
                </p>
            : null}

            {added ?
                <p className={styles.addedNote}>✓ Added to your log</p>
            : active ?
                <>
                    {failed ? <p className={styles.failedNote}>Couldn&apos;t add it. Try again.</p> : null}
                    <label className={styles.saveCheck}>
                        <input type="checkbox" checked={saveToCatalog} onChange={(e) => setSaveToCatalog(e.target.checked)} />
                        Also save to Quick Add
                    </label>
                    <div className={styles.proposalActions}>
                        <button type="button" className={styles.secondaryButton} onClick={onRefine}>Keep refining</button>
                        <button type="button" className={styles.primaryButton} onClick={add} disabled={adding || quantity <= 0}>
                            {adding ? "Adding…" : "Add to log"}
                        </button>
                    </div>
                </>
            : <p className={styles.muted}>Replaced by a newer suggestion</p>}
        </div>
    )
}

// Chat with the local Gemma model, which looks foods up on Google and proposes a log entry
export default function FoodAssistant({ dateKey, onAdd }: FoodAssistantProps) {
    const [items, setItems] = useState<Item[]>([])
    // the model-side conversation (incl. tool calls); the server is stateless, so it's sent back each turn
    const [history, setHistory] = useState<unknown[]>([])
    const [draft, setDraft] = useState("")
    const [photo, setPhoto] = useState<string | null>(null) // a prepared label photo waiting to be sent
    const [photoError, setPhotoError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const abortRef = useRef<AbortController | null>(null)
    const nextId = useRef(0)
    const logRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // cards from the latest reply can be added; older ones are kept for reference
    const lastUserId = [...items].reverse().find((item) => item.kind === "user")?.id ?? -1

    useEffect(() => {
        const log = logRef.current
        if (log) log.scrollTop = log.scrollHeight
    }, [items])

    useEffect(() => () => abortRef.current?.abort(), [])

    function push(item: NewItem) {
        const id = nextId.current++
        setItems((prev) => [...prev, { ...item, id }])
    }

    // appends to the reply being written, or starts one
    function appendText(text: string) {
        setItems((prev) => {
            const last = prev[prev.length - 1]
            if (last?.kind === "assistant") return [...prev.slice(0, -1), { ...last, text: last.text + text }]
            if (!text.trim()) return prev
            return [...prev, { id: nextId.current++, kind: "assistant", text: text.replace(/^\s+/, "") }]
        })
    }

    async function choosePhoto(file: File | undefined) {
        setPhotoError(null)
        if (!file) return
        try {
            setPhoto(await preparePhoto(file))
            inputRef.current?.focus()
        } catch (err) {
            setPhotoError(err instanceof Error ? err.message : "Couldn't use that photo.")
        } finally {
            if (fileRef.current) fileRef.current.value = "" // so choosing the same file again still fires
        }
    }

    async function send(text: string) {
        const message = text.trim()
        const image = photo
        if ((!message && !image) || busy) return
        setDraft("")
        setPhoto(null)
        setPhotoError(null)
        setBusy(true)
        push({ kind: "user", text: message, ...(image ? { photo: image } : {}) })

        const controller = new AbortController()
        abortRef.current = controller
        try {
            const res = await fetch("/api/diet/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ history, message, today: dateKey, ...(image ? { image } : {}) }),
                signal: controller.signal,
            })
            if (!res.ok || !res.body) {
                const json = await res.json().catch(() => null)
                push({ kind: "error", text: json?.message ?? "The assistant couldn't answer. Try again." })
                return
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffered = ""
            for (;;) {
                const { value, done } = await reader.read()
                if (done) break
                buffered += decoder.decode(value, { stream: true })
                const lines = buffered.split("\n")
                buffered = lines.pop() ?? ""
                for (const line of lines) {
                    if (!line.trim()) continue
                    const event = JSON.parse(line)
                    if (event.type === "delta") appendText(event.text)
                    else if (event.type === "status") push({ kind: "status", text: event.text })
                    else if (event.type === "proposal") push({ kind: "proposal", proposal: event.proposal })
                    else if (event.type === "error") push({ kind: "error", text: event.message })
                    else if (event.type === "done") setHistory(event.history)
                }
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                console.error("Diet assistant failed: ", err)
                push({ kind: "error", text: "Lost the connection to the assistant. Try again." })
            }
        } finally {
            abortRef.current = null
            setBusy(false)
        }
    }

    function stop() {
        abortRef.current?.abort()
        push({ kind: "status", text: "Stopped" })
    }

    function reset() {
        abortRef.current?.abort()
        setItems([])
        setHistory([])
        setDraft("")
        setPhoto(null)
        setPhotoError(null)
        inputRef.current?.focus()
    }

    function refine() {
        inputRef.current?.focus()
        if (!draft) setDraft("Actually, ")
    }

    return (
        <section className={styles.assistant} aria-label="Nutrition assistant">
            <div className={styles.header}>
                <div className={styles.title}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" fill="currentColor"/>
                        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" fill="currentColor" opacity="0.6"/>
                    </svg>
                    <p>Describe it instead</p>
                </div>
                {items.length > 0 ? <button type="button" className={styles.linkButton} onClick={reset}>New chat</button> : null}
            </div>

            <div className={styles.log} ref={logRef} role="log" aria-live="polite">
                {items.length === 0 ?
                    <div className={styles.empty}>
                        <p>Don&apos;t know the exact numbers? Tell me what you had and roughly how much, paste a link, or send a photo of the nutrition label. I&apos;ll work it out, and you confirm before anything is logged.</p>
                        <div className={styles.suggestions}>
                            {SUGGESTIONS.map((suggestion) => (
                                <button type="button" key={suggestion} className={styles.suggestion} onClick={() => send(suggestion)}>{suggestion}</button>
                            ))}
                        </div>
                        <p className={styles.attribution}>
                            Nutrition data: USDA FoodData Central, and Health Canada&apos;s Canadian Nutrient File (contains information licensed under the Open Government Licence – Canada).
                        </p>
                    </div>
                : items.map((item) => (
                    item.kind === "proposal" ?
                        <ProposalCard key={item.id} proposal={item.proposal} active={item.id > lastUserId && !busy} onAdd={onAdd} onRefine={refine} />
                    : item.kind === "status" ?
                        <p key={item.id} className={styles.status}>{item.text}</p>
                    :
                    item.kind === "user" && item.photo ?
                        <div key={item.id} className={`${styles.bubble} ${styles.user} ${styles.photoBubble}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL this page drew itself */}
                            <img src={item.photo} alt="Your nutrition label photo" />
                            {item.text ? <p>{item.text}</p> : null}
                        </div>
                    :
                        <p key={item.id} className={`${styles.bubble} ${item.kind === "user" ? styles.user : item.kind === "error" ? styles.error : styles.reply}`}>{item.kind === "assistant" ? plain(item.text) : item.text}</p>
                ))}
                {busy && items[items.length - 1]?.kind !== "assistant" ? <span className={styles.typing} aria-label="Thinking"><i /><i /><i /></span> : null}
            </div>

            {photo || photoError ?
                <div className={styles.photoTray}>
                    {photo ?
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL this page drew itself */}
                            <img src={photo} alt="Label photo to send" />
                            <span>Label photo ready. Add a note (like how much you had) or just send it.</span>
                            <button type="button" className={styles.linkButton} onClick={() => setPhoto(null)}>Remove</button>
                        </>
                    : <span className={styles.photoError}>{photoError}</span>}
                </div>
            : null}
            <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); send(draft) }}>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    hidden
                    onChange={(e) => choosePhoto(e.target.files?.[0])}
                />
                <button type="button" className={styles.photoButton} onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Add a photo of a nutrition label">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
                        <circle cx="12" cy="13" r="3.3" stroke="currentColor" strokeWidth="1.7"/>
                    </svg>
                </button>
                <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    maxLength={1000}
                    placeholder="e.g. a big bowl of chicken curry"
                    aria-label="Describe what you ate"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft) } }}
                />
                {busy ?
                    <button type="button" className={styles.sendButton} onClick={stop} aria-label="Stop">
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor"/></svg>
                    </button>
                :
                    <button type="submit" className={styles.sendButton} disabled={!draft.trim() && !photo} aria-label="Send">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                }
            </form>
        </section>
    )
}
