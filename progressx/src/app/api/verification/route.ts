import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "../libs/helpers";
import { overLimit } from "../libs/videos";
import { vaultConfigured } from "../libs/idVault";
import { removeVerification, verificationStatus, verifyDocument } from "../libs/idVerification";
import { supabase } from "@/app/supabaseClient/client";
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo";

const MAX_FILE_BYTES = 6 * 1024 * 1024    // the browser shrinks photos to ~2000 px first; these are well under
const MAX_REQUEST_BYTES = 13 * 1024 * 1024
const ATTEMPTS_PER_DAY = 5
const HEARTBEAT_MS = 10_000
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]

// GET /api/verification   -> { status: { state, documentType, issuingCountry, expiresOn, verifiedAt, reason }, available }
// Only the outcome is ever returned: never the images, names, dates of birth or document numbers.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    try {
        return NextResponse.json({ status: await verificationStatus(userId), available: vaultConfigured() }, { headers: { "Cache-Control": "no-store" } })
    } catch (e) {
        console.log("Error loading verification status: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load your verification" }, { status: 500 })
    }
}

// POST /api/verification   multipart: kind = "passport" | "card", front, back (cards only), consent = "yes"
// Streams newline-delimited JSON while the document is checked (it takes up to a minute on this machine):
//   { type: "status", text } ... then { type: "result", ok: true, ... } or { type: "result", ok: false, reason }
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    if (!vaultConfigured()) return NextResponse.json({ message: "ID verification isn't set up yet" }, { status: 503 })

    if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
        return NextResponse.json({ message: "Those photos are too large" }, { status: 413 })
    }
    const form = await req.formData().catch(() => null)
    const kind = form?.get("kind")
    if (kind !== "passport" && kind !== "card") return NextResponse.json({ message: "Choose passport or card" }, { status: 400 })

    const file = async (name: string) => {
        const value = form?.get(name)
        if (!(value instanceof File) || value.size === 0) return null
        if (value.size > MAX_FILE_BYTES) throw new Error("Each photo must be 6 MB or smaller")
        if (value.type && !IMAGE_TYPES.includes(value.type)) throw new Error("Photos must be JPG, PNG, WebP or HEIC")
        return Buffer.from(await value.arrayBuffer())
    }
    let front: Buffer | null, back: Buffer | null
    try {
        front = await file("front")
        back = kind === "card" ? await file("back") : null
    } catch (e) {
        return NextResponse.json({ message: e instanceof Error ? e.message : "Couldn't read those photos" }, { status: 400 })
    }
    if (!front || (kind === "card" && !back)) {
        return NextResponse.json({ message: kind === "card" ? "Add photos of the front and back of your card" : "Add a photo of your passport's photo page" }, { status: 400 })
    }
    if (form?.get("consent") !== "yes") {
        return NextResponse.json({ message: "Agree to how your ID is checked and stored to continue" }, { status: 400 })
    }
    if (overLimit(`verify:${userId}`, ATTEMPTS_PER_DAY, 24 * 60 * 60 * 1000)) {
        return NextResponse.json({ message: "You've tried several times today. Try again tomorrow." }, { status: 429 })
    }

    // the express consent to ID processing is recorded like the terms consent (what, when, which browser)
    const { error: consentError } = await supabase.from("consent_events").insert({
        user_id: userId,
        terms_version: TERMS_VERSION,
        age_confirmed: false,
        source: "id_verification",
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400),
    })
    if (consentError) {
        console.log("Couldn't record ID consent: ", consentError.message)
        return NextResponse.json({ message: "Couldn't start the check. Try again." }, { status: 500 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        async start(controller) {
            let closed = false
            const send = (event: Record<string, unknown>) => {
                if (closed) return
                try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")) } catch { closed = true }
            }
            const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS)
            try {
                const outcome = await verifyDocument(userId, kind, { front: front!, back }, req.signal, (text) => send({ type: "status", text }))
                send({ type: "result", ...outcome })
            } catch (e) {
                // details stay out of the logs: no document contents are ever logged
                console.log("ID verification failed to run: ", e instanceof Error ? e.name : "error")
                send({ type: "result", ok: false, reason: "We couldn't check your document right now. Try again in a few minutes." })
            } finally {
                clearInterval(heartbeat)
                closed = true
                try { controller.close() } catch { /* already closed */ }
            }
        },
    })
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } })
}

// DELETE /api/verification   -> removes your ID images and verification (you'll need to verify again to post)
export async function DELETE(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    try {
        await removeVerification(userId)
        return NextResponse.json({ message: "Your ID has been removed" })
    } catch (e) {
        console.log("Error removing an ID: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't remove your ID right now. Try again." }, { status: 502 })
    }
}
