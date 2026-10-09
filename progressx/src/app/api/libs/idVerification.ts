import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { supabase } from "@/app/supabaseClient/client";
import { cleanImage } from "./imageUpload";
import { ageOn, parseAamva, passportFromMrzText, type LicenceBarcode, type PassportMrz } from "./idDocuments";
import { deleteDocuments, deleteUserDocuments, documentFingerprint, encryptDocument, idPrefix, newDataKey, putEncrypted, wipe } from "./idVault";
import { LEGAL_MINIMUM_AGE } from "@/app/internal_components/legal/legalInfo";

// Automated review of a government ID, entirely on this machine (nothing is sent to an outside service):
//
//   passport:          the photo page. The local vision model reads it, and the machine-readable zone
//                      must pass every ICAO 9303 check digit (a random or invented image can't).
//   licence / ID card: front and back. The PDF417 barcode on the back is decoded and must be a valid
//                      AAMVA record (every Canadian province and US state uses it), and the front must
//                      be read as the same document (its birth or expiry date matches the barcode).
//   then, for both:    not expired, 18 or older, the age on the profile matches, and the document isn't
//                      already verifying another account.
//
// What this can't do: tell a real document from a convincing fake, or confirm the ID belongs to the
// person holding it (that needs a live selfie compared to the ID photo).

export type { Identity }
export type DocumentKind = "passport" | "drivers_licence" | "id_card"

export type VerificationOutcome =
    | { ok: true, documentType: DocumentKind, issuingCountry: string, expiresOn: string }
    | { ok: false, reason: string }

type Images = { front: Buffer, back: Buffer | null }

const MIN_SIDE = 600

// ---------- reading the document ----------

const READ_SCHEMA = {
    type: "object",
    properties: {
        is_identity_document: { type: "boolean" },
        document_type: { type: "string", enum: ["passport", "drivers_licence_front", "drivers_licence_back", "id_card", "other"] },
        date_of_birth: { type: "string" },
        expiry_date: { type: "string" },
        mrz_line_1: { type: "string" },
        mrz_line_2: { type: "string" },
    },
    required: ["is_identity_document", "document_type", "date_of_birth", "expiry_date", "mrz_line_1", "mrz_line_2"],
}

const READ_PROMPT = `Read this photo of an identity document. Copy what is printed exactly.
is_identity_document: true only for a real government-issued passport, driver's licence or identity card.
date_of_birth / expiry_date: as YYYY-MM-DD, or "" if not printed.
mrz_line_1 / mrz_line_2: on a passport, the two lines of machine-readable characters at the bottom (letters, digits and <), character by character; "" if there are none.`

type DocumentReading = { isIdentityDocument: boolean, type: string, birthDate: string, expiryDate: string, mrz: string[] }

// One structured question to the local vision model about the photo
async function askModel(jpeg: Buffer, prompt: string, schema: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
    const baseUrl = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "")
    const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: process.env.OLLAMA_MODEL ?? "gemma4:e2b",
            stream: false,
            think: false,
            format: schema,
            options: { temperature: 0, num_predict: 400 },
            messages: [{ role: "user", content: prompt, images: [jpeg.toString("base64")] }],
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`The document reader is unavailable (${res.status})`)
    try { return JSON.parse(String(json?.message?.content ?? "{}")) } catch { return {} } // unreadable reply: nothing read
}

const MRZ_SCHEMA = { type: "object", properties: { line_1: { type: "string" }, line_2: { type: "string" } }, required: ["line_1", "line_2"] }
const MRZ_PROMPT = "At the bottom of this passport page there are two lines of machine-readable text made of capital letters, digits and the < character. Copy line 1 and line 2 exactly, character by character, including every <."

// A focused read of just the machine-readable zone (far more accurate than asking for it among other fields)
async function readMrz(jpeg: Buffer, signal: AbortSignal): Promise<string[]> {
    const data = await askModel(jpeg, MRZ_PROMPT, MRZ_SCHEMA, signal)
    return [String(data.line_1 ?? "").slice(0, 120), String(data.line_2 ?? "").slice(0, 120)]
}

async function readDocument(jpeg: Buffer, signal: AbortSignal): Promise<DocumentReading> {
    const data = await askModel(jpeg, READ_PROMPT, READ_SCHEMA, signal)
    const text = (key: string) => String(data[key] ?? "").slice(0, 120)
    return {
        isIdentityDocument: data.is_identity_document === true,
        type: text("document_type"),
        birthDate: text("date_of_birth"),
        expiryDate: text("expiry_date"),
        mrz: [text("mrz_line_1"), text("mrz_line_2")],
    }
}

let zxingReady = false
async function decodeLicenceBarcode(jpeg: Buffer): Promise<LicenceBarcode | null> {
    if (!zxingReady) {
        // the decoder's WebAssembly comes from the installed package, never from a CDN
        const wasm = readFileSync(join(process.cwd(), "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"))
        prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true })
        zxingReady = true
    }
    const { data, info } = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    try {
        const results = await readBarcodes(
            { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height, colorSpace: "srgb" } as ImageData,
            { formats: ["PDF417"], tryHarder: true, tryRotate: true, textMode: "Plain", maxNumberOfSymbols: 2 },
        )
        for (const result of results) {
            const parsed = result.isValid ? parseAamva(result.text) : null
            if (parsed) return parsed
        }
        return null
    } finally {
        wipe(data)
    }
}

// ---------- the review ----------

export async function prepare(raw: Buffer, label: string): Promise<Buffer> {
    // re-encoded from pixels: strips location / camera metadata and anything that isn't image data
    const clean = await cleanImage(raw, { maxDimension: 2000, quality: 90 })
    const meta = await sharp(clean).metadata()
    if (Math.min(meta.width ?? 0, meta.height ?? 0) < MIN_SIDE) {
        throw new ReviewError(`The ${label} photo is too small to read. Use your camera at full resolution.`)
    }
    return clean
}

export class ReviewError extends Error {}

function isFuture(date: string) {
    return date >= new Date().toISOString().slice(0, 10)
}

type Identity = { kind: DocumentKind, issuer: string, country: string, documentNumber: string, birthDate: string, expiryDate: string }

async function reviewPassport(front: Buffer, signal: AbortSignal, onStatus: (text: string) => void): Promise<Identity> {
    onStatus("Reading the machine-readable zone")
    // the check digits decide, not the model's opinion of the photo (it's a small model: a real passport
    // it misjudges shouldn't fail, and a fake it believes shouldn't pass)
    let mrz: PassportMrz | null = passportFromMrzText(...await readMrz(front, signal))
    let reading: DocumentReading | null = null
    if (!mrz) {
        onStatus("Reading your passport")
        reading = await readDocument(front, signal)
        mrz = passportFromMrzText(...reading.mrz)
    }
    if (!mrz) {
        throw new ReviewError(reading?.isIdentityDocument && reading.type === "passport"
            ? "We couldn't read the two lines of code at the bottom of the photo page. Retake the photo flat, in good light, with the whole page in view and no glare."
            : "That doesn't look like a passport photo page. Take a photo of the page with your picture and the two lines of code at the bottom.")
    }
    return { kind: "passport", issuer: mrz.issuingCountry, country: mrz.issuingCountry, documentNumber: mrz.documentNumber, birthDate: mrz.birthDate, expiryDate: mrz.expiryDate }
}

async function reviewCard(front: Buffer, back: Buffer, signal: AbortSignal, onStatus: (text: string) => void): Promise<Identity> {
    onStatus("Reading the barcode on the back")
    const barcode = await decodeLicenceBarcode(back)
    if (!barcode) {
        throw new ReviewError("We couldn't read the barcode on the back of your card. Retake the back photo flat, in good light, with the whole barcode in view.")
    }
    onStatus("Reading the front of your card")
    const reading = await readDocument(front, signal)
    // the front has to be the same card as the barcode: its printed birth or expiry date must match
    if (reading.birthDate !== barcode.birthDate && reading.expiryDate !== barcode.expiryDate) {
        throw new ReviewError(reading.isIdentityDocument && ["drivers_licence_front", "id_card"].includes(reading.type)
            ? "The front and back don't look like the same card, or the front's dates couldn't be read. Retake both photos of one card in good light."
            : "The front photo doesn't look like a driver's licence or ID card. Take a photo of the side with your picture on it.")
    }
    return {
        kind: barcode.kind,
        issuer: barcode.issuer,
        country: [barcode.country, barcode.jurisdiction].filter(Boolean).join("-"),
        documentNumber: barcode.documentNumber,
        birthDate: barcode.birthDate,
        expiryDate: barcode.expiryDate,
    }
}

// The document checks on their own (no account or storage involved): what it is, that its codes check
// out, that it's still valid and that the holder is an adult. Throws ReviewError with a message for the user.
export async function reviewDocument(kind: "passport" | "card", images: Images, signal: AbortSignal, onStatus: (text: string) => void): Promise<Identity> {
    const identity = kind === "passport"
        ? await reviewPassport(images.front, signal, onStatus)
        : await reviewCard(images.front, images.back!, signal, onStatus)
    onStatus("Checking the details")
    if (!isFuture(identity.expiryDate)) throw new ReviewError("That document has expired. Use one that's still valid.")
    if (ageOn(identity.birthDate) < LEGAL_MINIMUM_AGE) throw new ReviewError(`You must be ${LEGAL_MINIMUM_AGE} or older to use ProgressX.`)
    return identity
}

const verifying = new Set<string>()

// Reviews the document; if it passes, stores the images encrypted and marks the user verified.
// Rejected documents are never stored.
export async function verifyDocument(
    userId: string,
    kind: "passport" | "card",
    raw: { front: Buffer, back: Buffer | null },
    signal: AbortSignal,
    onStatus: (text: string) => void,
): Promise<VerificationOutcome> {
    if (verifying.has(userId)) return { ok: false, reason: "A check is already running for your account." }
    verifying.add(userId)
    const images: Images = { front: Buffer.alloc(0), back: null }
    try {
        onStatus("Preparing your photos")
        images.front = await prepare(raw.front, kind === "passport" ? "passport" : "front")
        if (kind === "card") {
            if (!raw.back) throw new ReviewError("Add a photo of the back of your card too.")
            images.back = await prepare(raw.back, "back")
        }

        const identity = await reviewDocument(kind, images, signal, onStatus)
        const { data: profile } = await supabase.from("profiles").select("age").eq("id", userId).maybeSingle()
        if (profile?.age && Math.abs(Number(profile.age) - ageOn(identity.birthDate)) > 1) {
            throw new ReviewError("The birth date on this document doesn't match the age on your profile. If your profile age is wrong, fix it in Settings first.")
        }

        const fingerprint = documentFingerprint(identity.kind, identity.issuer, identity.documentNumber)
        const { data: taken } = await supabase.from("id_verifications").select("user_id").eq("fingerprint", fingerprint).eq("status", "verified").neq("user_id", userId).maybeSingle()
        if (taken) throw new ReviewError("This document is already verifying another ProgressX account.")

        onStatus("Encrypting and saving")
        const attempt = crypto.randomUUID()
        const keys = [`${idPrefix(userId)}${attempt}/front.bin`, ...(images.back ? [`${idPrefix(userId)}${attempt}/back.bin`] : [])]
        const { dataKey, wrapped } = newDataKey(userId)
        try {
            await putEncrypted(keys[0], encryptDocument(userId, keys[0], dataKey, images.front))
            if (images.back) await putEncrypted(keys[1], encryptDocument(userId, keys[1], dataKey, images.back))
        } catch (e) {
            await deleteDocuments(keys).catch(() => {})
            throw e
        } finally {
            wipe(dataKey)
        }

        const now = new Date().toISOString()
        const { error } = await supabase.from("id_verifications").upsert({
            user_id: userId,
            status: "verified",
            document_type: identity.kind,
            issuing_country: identity.country.slice(0, 12),
            expires_on: identity.expiryDate,
            verified_at: now,
            rejection_reason: null,
            fingerprint,
            object_keys: keys,
            wrapped_key: wrapped.wrapped,
            key_version: wrapped.version,
            updated_at: now,
        }, { onConflict: "user_id" })
        if (error) {
            // don't leave the new, unreferenced ID files behind (an existing verification keeps its own)
            await deleteDocuments(keys).catch(() => {})
            if (error.code === "23505") throw new ReviewError("This document is already verifying another ProgressX account.")
            throw error
        }
        // a previous verification's files are replaced by this one
        await deleteUserDocuments(userId, keys).catch((e) => console.log("Couldn't remove an older ID file: ", e instanceof Error ? e.message : e))

        return { ok: true, documentType: identity.kind, issuingCountry: identity.country, expiresOn: identity.expiryDate }
    } catch (e) {
        if (!(e instanceof ReviewError)) throw e
        // remember the rejection only if there's no current verification to keep
        const { data: current } = await supabase.from("id_verifications").select("status").eq("user_id", userId).maybeSingle()
        if (current?.status !== "verified") {
            await supabase.from("id_verifications").upsert({
                user_id: userId, status: "rejected", rejection_reason: e.message.slice(0, 300), updated_at: new Date().toISOString(),
                document_type: null, issuing_country: null, expires_on: null, verified_at: null, fingerprint: null, object_keys: [], wrapped_key: null, key_version: null,
            }, { onConflict: "user_id" })
        }
        return { ok: false, reason: e.message }
    } finally {
        wipe(images.front, images.back, raw.front, raw.back)
        verifying.delete(userId)
    }
}

// ---------- status ----------

export type VerificationStatus = {
    state: "verified" | "expired" | "rejected" | "none",
    documentType: DocumentKind | null,
    issuingCountry: string | null,
    expiresOn: string | null,
    verifiedAt: string | null,
    reason: string | null,
}

export async function verificationStatus(userId: string): Promise<VerificationStatus> {
    const { data, error } = await supabase
        .from("id_verifications")
        .select("status, document_type, issuing_country, expires_on, verified_at, rejection_reason")
        .eq("user_id", userId)
        .maybeSingle()
    if (error) throw error
    if (!data) return { state: "none", documentType: null, issuingCountry: null, expiresOn: null, verifiedAt: null, reason: null }
    const expired = data.status === "verified" && data.expires_on && !isFuture(data.expires_on)
    return {
        state: data.status === "verified" ? (expired ? "expired" : "verified") : "rejected",
        documentType: data.document_type,
        issuingCountry: data.issuing_country,
        expiresOn: data.expires_on,
        verifiedAt: data.verified_at,
        reason: data.rejection_reason,
    }
}

export async function isVerified(userId: string): Promise<boolean> {
    return (await verificationStatus(userId)).state === "verified"
}

// Removes the ID: its files first (if that fails nothing changes), then the record
export async function removeVerification(userId: string) {
    await deleteUserDocuments(userId)
    const { error } = await supabase.from("id_verifications").delete().eq("user_id", userId)
    if (error) throw error
}
