import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "../../libs/helpers";
import { googleOverview, OverviewUnavailableError } from "../../libs/googleOverview";
import { describeMatches, getFood, searchFoods } from "../../libs/foodDatabase";
import { FoodPageError, linksIn, readFoodPage } from "../../libs/foodPage";
import { ImageUploadError, cleanImage } from "../../libs/imageUpload";
import {
    ChatMessage, EXTRACTION_SCHEMA, FOOD_SEARCH_TOOL, FoodProposal, GOOGLE_TOOL, MAX_USER_MESSAGE, PAGE_FOOD_ID, PAGE_TOOL, PASTED_FOOD_ID,
    NO_LABEL, PASTED_META_SCHEMA, PHOTO_MARKER, PROPOSE_TOOL, labelPhotoPrompt, describePrompt, looksLikeNutritionFacts, statedNutrients, pastedMetaPrompt, extractionPrompt, forChatModel, latestFoodIds, latestPage, searchThatFound, latestGoogleResults, portionPrompt, portionSchema, proposalFromDatabase,
    proposalFromText, sanitizeHistory, systemPrompt, tools,
} from "../../libs/dietAssistant";

// POST /api/diet/assistant  { history: ChatMessage[], message: string, today?: "YYYY-MM-DD", image?: "data:image/jpeg;base64,..." }
// `image` is an optional photo of a nutrition label (JPEG, PNG or WebP, at most 4 MB). It's checked by
// its bytes, re-encoded from its pixels (nothing hidden in the file survives), read once, and not kept.
// One turn of the diet assistant chat. Streams newline-delimited JSON events while it works:
//   { type: "status", text }        what it's doing ("Searching foods for ...")
//   { type: "delta", text }         reply text as it's written
//   { type: "proposal", proposal }  a food entry for the user to confirm (nothing is logged here)
//   { type: "done", history }       the conversation so far, to send back with the next message
//   { type: "error", message }
// The chat isn't stored anywhere: the browser holds the history.

const MAX_MODEL_CALLS = 10
const MAX_PROPOSALS_PER_TURN = 4
const MAX_SEARCHES_PER_TURN = 8
const TURNS_PER_WINDOW = 30
const WINDOW_MS = 15 * 60 * 1000
const HEARTBEAT_MS = 10_000

// photos: the browser shrinks them to ~1600 px first, so real requests are well under these
const MAX_PHOTO_BYTES = 4 * 1024 * 1024
const MAX_REQUEST_BYTES = 6 * 1024 * 1024 // photo (as base64, +33%) + conversation
const PHOTOS_PER_WINDOW = 10
const recentPhotos = new Map<string, number[]>()

function photoOverLimit(userId: string): boolean {
    const now = Date.now()
    const photos = (recentPhotos.get(userId) ?? []).filter((at) => now - at < WINDOW_MS)
    const over = photos.length >= PHOTOS_PER_WINDOW
    if (!over) photos.push(now)
    recentPhotos.set(userId, photos)
    return over
}

// The photo from the request, checked and re-encoded as a clean JPEG (base64 for Ollama)
async function readPhoto(raw: unknown): Promise<string> {
    const found = typeof raw === "string" ? raw.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/) : null
    if (!found) throw new ImageUploadError("Send the photo as a JPG, PNG or WebP image", 415)
    if (found[2].length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) throw new ImageUploadError("Photos must be 4 MB or smaller", 413)
    const clean = await cleanImage(Buffer.from(found[2], "base64"), { maxDimension: 1600, quality: 85 })
    return clean.toString("base64")
}

// Reads the label in a photo out as text (the vision part of the model)
async function readLabelPhoto(jpegBase64: string, signal: AbortSignal): Promise<string> {
    const res = await ollama({
        messages: [{ role: "user", content: labelPhotoPrompt(), images: [jpegBase64] }],
        stream: false,
        options: { temperature: 0, num_predict: 500 },
    }, signal)
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`Ollama responded ${res.status} ${json?.error ?? ""}`)
    return String(json?.message?.content ?? "").replace(/[*_#`]/g, "").trim().slice(0, 3000)
}

// per-user turn limit (each turn runs the model a few times, and may spend Google lookups), kept in memory
const recentTurns = new Map<string, number[]>()

function overLimit(userId: string): boolean {
    const now = Date.now()
    const turns = (recentTurns.get(userId) ?? []).filter((at) => now - at < WINDOW_MS)
    if (turns.length >= TURNS_PER_WINDOW) {
        recentTurns.set(userId, turns)
        return true
    }
    turns.push(now)
    recentTurns.set(userId, turns)
    return false
}

type ModelReply = { content: string, toolCalls: NonNullable<ChatMessage["tool_calls"]> }

function ollama(body: Record<string, unknown>, signal: AbortSignal) {
    const baseUrl = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "")
    return fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? "gemma4:e2b", think: false, ...body }),
        signal,
    })
}

// Step 2: answers a focused question in a fixed JSON shape (which portion, or the numbers in a text)
async function structured(prompt: string, schema: object, signal: AbortSignal): Promise<Record<string, unknown>> {
    const res = await ollama({
        messages: [{ role: "user", content: prompt }],
        format: schema,
        stream: false,
        options: { temperature: 0 },
    }, signal)
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.message?.content) throw new Error(`Ollama responded ${res.status} ${json?.error ?? ""}`)
    return JSON.parse(json.message.content)
}

// A short free-text answer to a one-off question
async function complete(prompt: string, signal: AbortSignal): Promise<string> {
    const res = await ollama({ messages: [{ role: "user", content: prompt }], stream: false, options: { temperature: 0, num_predict: 120 } }, signal)
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`Ollama responded ${res.status} ${json?.error ?? ""}`)
    return String(json?.message?.content ?? "")
}

// Step 1: streams one chat response, forwarding text as it arrives
async function callModel(messages: ChatMessage[], today: string, googleEnabled: boolean, signal: AbortSignal, onText: (text: string) => void): Promise<ModelReply> {
    const res = await ollama({
        messages: [{ role: "system", content: systemPrompt(today, googleEnabled) }, ...messages.map(forChatModel)],
        tools: tools(googleEnabled),
        stream: true,
        options: { temperature: 0.2 },
    }, signal)
    if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "")
        throw new Error(`Ollama responded ${res.status} ${detail.slice(0, 200)}`)
    }

    const reply: ModelReply = { content: "", toolCalls: [] }
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
            const chunk = JSON.parse(line)
            if (chunk.error) throw new Error(`Ollama: ${chunk.error}`)
            const text = chunk.message?.content
            if (text) {
                reply.content += text
                onText(text)
            }
            for (const call of chunk.message?.tool_calls ?? []) {
                if (call?.function?.name) reply.toolCalls.push({ function: { name: call.function.name, arguments: call.function.arguments ?? {} } })
            }
        }
    }
    return reply
}

// Turns propose_food_entry into a proposal: the chosen database food (or, failing that, the latest
// Google results, or the latest database search's best match, or a rough estimate)
async function buildProposal(
    food: { name: string, amount: string },
    foodId: string,
    history: ChatMessage[],
    userSaid: string[],
    plainFoods: () => Promise<string>,
    signal: AbortSignal,
    fromPhoto = false,
    totals = false,
): Promise<FoodProposal | { rejected: string, plainFoods: string }> {
    // nutrition facts the user typed or pasted into the chat
    if (foodId === PASTED_FOOD_ID) {
        const pasted = { query: "what the user pasted", kind: "search_snippets" as const, text: userSaid.join("\n\n"), sources: [] }
        const extracted = await structured(extractionPrompt({ ...food, name: food.name || "Food" }, userSaid, [pasted]), EXTRACTION_SCHEMA, signal)
        // typed numbers: only the nutrients the user actually gave (the model likes to fill carbs from
        // sugar and the like). Calories missing here are worked out from the macros later.
        if (!fromPhoto) {
            const given = new Set(statedNutrients(userSaid[userSaid.length - 1] ?? ""))
            for (const [key, nutrient] of [["calories", "calories"], ["protein_g", "protein"], ["carbs_g", "carbs"], ["fat_g", "fat"]] as const) {
                if (!given.has(nutrient)) extracted[key] = null
            }
        }
        return proposalFromText(food, extracted, fromPhoto ? "photo" : "pasted", [], undefined, totals)
    }

    let match = foodId && foodId !== PAGE_FOOD_ID ? await getFood(foodId) : null

    // a page the user linked: asked for by name, or read in this turn
    const page = match ? null : latestPage(history, foodId !== PAGE_FOOD_ID)
    if (page) {
        const pageResult = { query: page.url, kind: "search_snippets" as const, text: page.text, sources: [] }
        const extracted = await structured(extractionPrompt({ ...food, name: food.name || page.title }, userSaid, [pageResult]), EXTRACTION_SCHEMA, signal)
        return proposalFromText(food, extracted, "link", [{ title: page.title, link: page.url }], page)
    }

    const googleResults = match ? [] : latestGoogleResults(history)
    if (!match && googleResults.length === 0) {
        const fallbackId = latestFoodIds(history)[0]
        if (fallbackId) match = await getFood(fallbackId)
    }

    if (match) {
        const foods = await plainFoods()
        const choice = await structured(portionPrompt(food.amount, userSaid, foods, match), portionSchema(match), signal)
        if (choice.match === "different") return { rejected: match.name, plainFoods: foods }
        return proposalFromDatabase(food, match, choice, searchThatFound(history, match.id))
    }

    const named = { ...food, name: food.name || "Food" }
    const extracted = await structured(extractionPrompt(named, userSaid, googleResults), EXTRACTION_SCHEMA, signal)
    const basis = googleResults.length === 0 ? "estimate" : googleResults.some((r) => r.kind === "ai_overview") ? "ai_overview" : "search"
    const sources = [...new Map(googleResults.flatMap((r) => r.sources).map((s) => [s.link, s])).values()].slice(0, 5)
    return proposalFromText(named, extracted, basis, sources)
}

export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const declaredLength = Number(req.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
        return NextResponse.json({ message: "That photo is too big. Try a smaller one." }, { status: 413 })
    }
    const rawBody = await req.text().catch(() => "")
    if (rawBody.length > MAX_REQUEST_BYTES) {
        return NextResponse.json({ message: "That photo is too big. Try a smaller one." }, { status: 413 })
    }
    let body: Record<string, unknown> | null = null
    try { body = JSON.parse(rawBody) } catch { /* handled below */ }

    let photo: string | null = null
    if (body?.image !== undefined && body?.image !== null) {
        if (photoOverLimit(userId)) {
            return NextResponse.json({ message: "That's a lot of photos. Give it a few minutes and try again." }, { status: 429 })
        }
        try {
            photo = await readPhoto(body.image)
        } catch (e) {
            if (e instanceof ImageUploadError) return NextResponse.json({ message: e.message }, { status: e.status })
            throw e
        }
    }

    let message = typeof body?.message === "string" ? body.message.trim() : ""
    if (!message && photo) message = "Here's the nutrition label."
    if (!message) {
        return NextResponse.json({ message: "Say what you ate" }, { status: 400 })
    }
    if (message.length > MAX_USER_MESSAGE) {
        return NextResponse.json({ message: `Keep messages under ${MAX_USER_MESSAGE} characters` }, { status: 400 })
    }
    if (overLimit(userId)) {
        return NextResponse.json({ message: "You've sent a lot of messages. Give it a few minutes and try again." }, { status: 429 })
    }

    const today = typeof body?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10)
    const history: ChatMessage[] = [...sanitizeHistory(body?.history), { role: "user", content: message }]
    // the label text gets added to the user's message once the photo is read (in the stream below)
    const userTurn = history[history.length - 1]

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        async start(controller) {
            let closed = false
            const send = (event: Record<string, unknown>) => {
                if (closed) return
                try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")) } catch { closed = true }
            }
            // keeps proxies (nginx, Cloudflare) from timing out while the model is thinking
            const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS)

            try {
                if (photo) {
                    send({ type: "status", text: "Reading the label in your photo" })
                    const labelText = await readLabelPhoto(photo, req.signal)
                    if (!labelText || labelText.includes(NO_LABEL) || !looksLikeNutritionFacts(labelText)) {
                        const reply = "I couldn't read a nutrition facts label in that photo. Try a closer, well-lit, straight-on photo of the label, or type the numbers."
                        userTurn.content = `${message}\n\n(The user sent a photo, but no nutrition label could be read from it.)`
                        history.push({ role: "assistant", content: reply })
                        send({ type: "delta", text: reply })
                        send({ type: "done", history })
                        return
                    }
                    userTurn.content = `${message}\n\n${PHOTO_MARKER}\n${labelText}`
                }

                const googleEnabled = Boolean(process.env.SERPAPI_API_KEY)
                const userSaid = history.filter((m) => m.role === "user").slice(-4).map((m) => m.content)
                const latestSaid = userTurn.content
                // what the user ate in plain words (slang expanded), worked out once per turn when first needed
                let described: Promise<string> | null = null
                const plainFoods = () => described ??= complete(describePrompt(userSaid), req.signal)
                    .then((text) => text.replace(/[*_#`]/g, "").trim().slice(0, 400) || userSaid[userSaid.length - 1])
                let searches = 0
                let proposals = 0

                // nutrition numbers the user gave (typed, pasted or shorthand): straight onto a card, no searching
                if (looksLikeNutritionFacts(latestSaid)) {
                    const fromPhoto = latestSaid.includes(PHOTO_MARKER)
                    if (!fromPhoto) send({ type: "status", text: "Using the numbers you gave" })
                    const meta = await structured(pastedMetaPrompt(userSaid), PASTED_META_SCHEMA, req.signal)
                    let amount = String(meta.amount ?? "").trim().slice(0, 80)
                    // the label's own serving size isn't an amount eaten, and only an amount the user actually
                    // typed counts (the model fills in "one" or "one serving" when there isn't one)
                    const typed = message.toLowerCase()
                    const said = amount.toLowerCase()
                    if (/^(per|pour)\b/i.test(amount) || !typed.includes(said) || typed.split(said).slice(0, -1).every((before) => /\b(per|pour|serving size:?)\s*$/.test(before))) amount = ""
                    // typed numbers with no amount and no "per serving": they're for everything they ate
                    const totals = !fromPhoto && !amount && !/\bper\b|serving size|\bservings?\b|\/\s*100\s*g|\bpour\b/i.test(message)
                    let name = String(meta.name ?? "").trim().slice(0, 80)
                    if (!name || /not (visible|shown|given)|unknown|n\/a|\bproduct\b\s*$/i.test(name)) name = fromPhoto ? "Food from label" : "Food"
                    const food = { name, amount }
                    const built = await buildProposal(food, PASTED_FOOD_ID, history, userSaid, plainFoods, req.signal, fromPhoto, totals)
                    if (!("rejected" in built)) {
                        history.push({ role: "assistant", content: "", tool_calls: [{ function: { name: PROPOSE_TOOL, arguments: { food_id: PASTED_FOOD_ID, ...food } } }] })
                        history.push({ role: "tool", tool_name: PROPOSE_TOOL, content: JSON.stringify({ shown: true, entry: `${built.name} from the user's pasted nutrition facts`, accuracy: built.accuracy }) })
                        const reply = fromPhoto
                            ? "I've put it on a card from the label in your photo. Check the numbers and the amount, then add it."
                            : "I've put it on a card using the numbers you gave, no database search. Check the amount, then add it."
                        history.push({ role: "assistant", content: reply })
                        send({ type: "proposal", proposal: built })
                        send({ type: "delta", text: reply })
                        proposals = MAX_PROPOSALS_PER_TURN // skip the chat model this turn
                    }
                }

                for (let call = 0; call < MAX_MODEL_CALLS && proposals < MAX_PROPOSALS_PER_TURN; call++) {
                    if (call > 0) send({ type: "delta", text: "\n\n" })
                    const reply = await callModel(history, today, googleEnabled, req.signal, (text) => send({ type: "delta", text }))
                    history.push({ role: "assistant", content: reply.content, ...(reply.toolCalls.length ? { tool_calls: reply.toolCalls } : {}) })

                    if (reply.toolCalls.length === 0) break

                    for (const toolCall of reply.toolCalls) {
                        const args = toolCall.function.arguments
                        const name = toolCall.function.name
                        const query = String(args.query ?? "").slice(0, 200)

                        if ((name === FOOD_SEARCH_TOOL || name === GOOGLE_TOOL) && searches >= MAX_SEARCHES_PER_TURN) {
                            history.push({ role: "tool", tool_name: name, content: JSON.stringify({ ok: false, error: "Search limit reached for this reply. Pick from what you already found." }) })
                        } else if (name === FOOD_SEARCH_TOOL) {
                            searches++
                            send({ type: "status", text: `Searching foods for “${query}”` })
                            let result: Record<string, unknown>
                            try {
                                const { matches, loose } = await searchFoods(query)
                                result = { ok: true, query, results: describeMatches(matches, loose), ids: matches.map((m) => m.id), loose }
                            } catch (e) {
                                console.log("Food database search error: ", e instanceof Error ? e.message : e)
                                result = { ok: false, error: "The food database isn't reachable right now." }
                                send({ type: "status", text: "The food database isn't reachable right now" })
                            }
                            history.push({ role: "tool", tool_name: FOOD_SEARCH_TOOL, content: JSON.stringify(result) })
                        } else if (name === PAGE_TOOL) {
                            // only links the user wrote themselves; if the model's doesn't match one, use their latest
                            const userLinks = linksIn(history.filter((m) => m.role === "user").map((m) => m.content))
                            const asked = String(args.url ?? "").trim()
                            const link = userLinks.find((l) => l === asked || l.replace(/\/$/, "") === asked.replace(/\/$/, "")) ?? userLinks[userLinks.length - 1]
                            let result: Record<string, unknown>
                            if (!link) {
                                result = { ok: false, error: "The user hasn't given a link. Only links the user writes can be read." }
                            } else {
                                send({ type: "status", text: `Reading ${(() => { try { return new URL(link).hostname.replace(/^www\./, "") } catch { return "the link" } })()}` })
                                try {
                                    const page = await readFoodPage(link, history.filter((m) => m.role === "user").slice(-4).map((m) => m.content))
                                    result = {
                                        ok: true, url: page.url, host: page.host, title: page.title, kind: page.kind, text: page.text,
                                        summary: `Found nutrition facts for "${page.title}" on ${page.host}. Call ${PROPOSE_TOOL} with food_id "${PAGE_FOOD_ID}".`,
                                    }
                                } catch (e) {
                                    const reason = e instanceof FoodPageError ? e.message : "Couldn't read that page"
                                    if (!(e instanceof FoodPageError)) console.log("Food page read error: ", e instanceof Error ? e.message : e)
                                    result = { ok: false, error: `${reason}. Tell the user that in one sentence, then ask them to copy and paste the nutrition facts from the page (calories, fat, carbs, protein, etc. and the serving size), or offer to search the food database instead.` }
                                    send({ type: "status", text: reason })
                                }
                            }
                            history.push({ role: "tool", tool_name: PAGE_TOOL, content: JSON.stringify(result) })
                        } else if (name === GOOGLE_TOOL && googleEnabled) {
                            searches++
                            send({ type: "status", text: `Searching Google for “${query}”` })
                            let result: Record<string, unknown>
                            try {
                                result = { ok: true, ...await googleOverview(query) }
                            } catch (e) {
                                const reason = e instanceof OverviewUnavailableError ? e.message : "Google lookup failed"
                                if (!(e instanceof OverviewUnavailableError)) console.log("Google overview lookup error: ", e instanceof Error ? e.message : e)
                                result = { ok: false, error: reason }
                                send({ type: "status", text: reason })
                            }
                            history.push({ role: "tool", tool_name: GOOGLE_TOOL, content: JSON.stringify(result) })
                        } else if (name === PROPOSE_TOOL) {
                            const food = {
                                name: String(args.name ?? "").slice(0, 80),
                                amount: String(args.amount ?? "1 serving").slice(0, 80),
                            }
                            send({ type: "status", text: "Working out the amount" })
                            const built = await buildProposal(food, String(args.food_id ?? "").trim(), history, userSaid, plainFoods, req.signal)
                            if ("rejected" in built) {
                                history.push({
                                    role: "tool",
                                    tool_name: PROPOSE_TOOL,
                                    content: JSON.stringify({
                                        shown: false,
                                        error: `"${built.rejected}" isn't what the user ate (${built.plainFoods}). Search again with plain words for it, one item at a time (e.g. "coffee brewed", then "cream", then "sugar"). If the database doesn't have it, tell the user and ask what's in it.`,
                                    }),
                                })
                                continue
                            }
                            const proposal = built
                            proposals++

                            const option = proposal.options[proposal.optionIndex]
                            const total = (value: number) => Math.round(value * option.multiplier * proposal.quantity)
                            history.push({
                                role: "tool",
                                tool_name: PROPOSE_TOOL,
                                content: JSON.stringify({
                                    shown: true,
                                    entry: `${proposal.name}${proposal.matchedName ? ` (${proposal.matchedName})` : ""}: ${proposal.quantity} x ${option.label}, ${total(proposal.base.calories)} kcal, ${total(proposal.base.proteinG)} g protein, ${total(proposal.base.carbsG)} g carbs, ${total(proposal.base.fatsG)} g fat`,
                                    accuracy: proposal.accuracy,
                                    how: proposal.explanation.join(" "),
                                    note: "Shown to the user as a card (with the accuracy and how it was worked out). It is NOT in their log yet - they press Add on the card - so never say it was added. If they mentioned other foods that don't have a card yet, search and propose the next one. Otherwise reply with one short sentence; if accuracy isn't high, say briefly why and what detail would make it more accurate.",
                                }),
                            })
                            send({ type: "proposal", proposal })
                        } else {
                            history.push({ role: "tool", tool_name: name, content: JSON.stringify({ ok: false, error: "Unknown tool" }) })
                        }
                    }
                }

                send({ type: "done", history })
            } catch (e) {
                if (!req.signal.aborted) {
                    const reason = e instanceof Error ? e.message : String(e)
                    console.log("Diet assistant error: ", reason)
                    const unreachable = /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(reason)
                    send({
                        type: "error",
                        message: unreachable
                            ? "The assistant isn't running right now. Try again in a minute."
                            : /not found|pull/i.test(reason)
                                ? "The assistant's model is still downloading. Try again in a few minutes."
                                : "Something went wrong. Try again.",
                    })
                }
            } finally {
                clearInterval(heartbeat)
                closed = true
                try { controller.close() } catch { /* already closed */ }
            }
        },
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no", // stream through nginx as it's written
        },
    })
}
