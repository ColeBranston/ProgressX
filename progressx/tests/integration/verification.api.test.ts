import { randomBytes, randomUUID } from "node:crypto"
import sharp from "sharp"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { fakeR2 } from "../helpers/fakeR2"
import { apiRequest, useTestAuthEnv } from "../helpers/auth"
import { mrzCheckDigit } from "@/app/api/libs/idDocuments"

vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => { throw new Error("no auth calls expected") } }))
vi.mock("@aws-sdk/client-s3", async () => (await import("../helpers/fakeR2")).s3Module)
// the PDF417 decoder is WebAssembly reading real photos of real cards; here it "reads" what each test says
vi.mock("zxing-wasm/reader", () => ({ prepareZXingModule: vi.fn(), readBarcodes: vi.fn() }))

const { GET, POST, DELETE } = await import("@/app/api/verification/route")
const { verifyDocument } = await import("@/app/api/libs/idVerification")
const { readBarcodes } = await import("zxing-wasm/reader")

const BUCKET = "progressx-ids"

// ---------- documents ----------

// A TD3 passport MRZ with correct check digits (dates YYMMDD)
function passportMrz({ number = "AB1234567", birth = "900115", expiry = "350115" } = {}): [string, string] {
    const line1 = "P<CANSMITH<<JORDAN<LEE".padEnd(44, "<")
    const head = `${number}${mrzCheckDigit(number)}CAN${birth}${mrzCheckDigit(birth)}M${expiry}${mrzCheckDigit(expiry)}${"<".repeat(14)}<`
    const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 43)
    return [line1, head + mrzCheckDigit(composite)]
}

// An Ontario licence barcode (Canadian dates are CCYYMMDD)
const aamva = (fields: Record<string, string> = {}) => "@\n\x1e\rANSI 636012080002DL00410290ZO03190008DL" +
    Object.entries({ DAQ: "D1234-56789-01234", DCS: "SMITH", DAC: "JORDAN", DBB: "19900115", DBA: "20350115", DAJ: "ON", DCG: "CAN", ...fields }).map(([k, v]) => k + v).join("\n") + "\r"

const photo = (width = 900, height = 700) => sharp({ create: { width, height, channels: 3, background: "#ccd" } }).jpeg().toBuffer()

// ---------- the local vision model, faked at fetch ----------

let mrzRead: Record<string, unknown>
let documentRead: Record<string, unknown>
let modelStatus: number
let modelCalls: string[]

beforeEach(() => {
    fakeDb.reset()
    fakeR2.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.stubEnv("ID_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
    vi.stubEnv("ID_FINGERPRINT_KEY", randomBytes(32).toString("base64"))
    vi.stubEnv("R2_ACCOUNT_ID", "test-account")
    vi.stubEnv("R2_ID_ACCESS_KEY_ID", "id-key")
    vi.stubEnv("R2_ID_SECRET_ACCESS_KEY", "id-secret")
    const [line_1, line_2] = passportMrz()
    mrzRead = { line_1, line_2 }
    documentRead = { is_identity_document: true, document_type: "drivers_licence_front", date_of_birth: "1990-01-15", expiry_date: "2035-01-15", mrz_line_1: "", mrz_line_2: "" }
    modelStatus = 200
    modelCalls = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body))
        const isMrz = "line_1" in body.format.properties
        modelCalls.push(isMrz ? "mrz" : "document")
        expect(body.messages[0].images).toHaveLength(1)
        if (modelStatus !== 200) return Response.json({ error: "model crashed" }, { status: modelStatus })
        return Response.json({ message: { content: JSON.stringify(isMrz ? mrzRead : documentRead) } })
    }))
    vi.mocked(readBarcodes).mockResolvedValue([{ isValid: true, text: aamva() }] as never)
})

const newUser = (age: number | null = 36) => {
    const id = randomUUID()
    fakeDb.seed("profiles", [{ id, age }])
    return id
}

async function submit(userId: string | null, fields: Record<string, string | Blob | null>, headers: Record<string, string> = {}) {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) if (value !== null) form.append(name, value)
    const signed = await apiRequest("/api/verification", { userId })
    const req = new NextRequest(signed.url, { method: "POST", headers: { cookie: signed.headers.get("cookie") ?? "", "user-agent": "vitest-browser", ...headers }, body: form })
    const res = await POST(req)
    if (!res.headers.get("content-type")?.includes("ndjson")) return { res, events: [] as Record<string, unknown>[] }
    return { res, events: (await res.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>) }
}

const jpeg = async (buffer?: Buffer, type = "image/jpeg") => new File([new Uint8Array(buffer ?? await photo())], "id.jpg", { type })
const passport = async () => ({ kind: "passport", front: await jpeg(), consent: "yes" })
const card = async () => ({ kind: "card", front: await jpeg(), back: await jpeg(), consent: "yes" })
const result = (events: Record<string, unknown>[]) => events.find((e) => e.type === "result")
const record = (userId: string) => fakeDb.rows("id_verifications").find((r) => r.user_id === userId)
const status = async (userId: string) => (await (await GET(await apiRequest("/api/verification", { userId }))).json())

describe("POST /api/verification: checks before reading", () => {
    it("requires a signed-in user", async () => {
        expect((await submit(null, await passport())).res.status).toBe(401)
    })

    it("is unavailable until the ID vault is configured", async () => {
        vi.stubEnv("R2_ID_SECRET_ACCESS_KEY", "")
        const { res } = await submit(newUser(), await passport())
        expect(res.status).toBe(503)
    })

    it("refuses requests that are too big", async () => {
        const { res } = await submit(newUser(), await passport(), { "content-length": String(14 * 1024 * 1024) })
        expect(res.status).toBe(413)
    })

    it.each([
        [{ kind: "selfie" }, "Choose passport or card"],
        [{ kind: "passport" }, "Add a photo of your passport's photo page"],
        [{ kind: "card", front: "front" }, "Add photos of the front and back of your card"],
        [{ kind: "passport", front: new File([new Uint8Array(6 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }) }, "Each photo must be 6 MB or smaller"],
        [{ kind: "passport", front: new File(["%PDF"], "id.pdf", { type: "application/pdf" }) }, "Photos must be JPG, PNG, WebP or HEIC"],
        [{ kind: "passport", front: new File(["x"], "id.jpg", { type: "image/jpeg" }), consent: "no" }, "Agree to how your ID is checked and stored to continue"],
    ])("rejects %#", async (fields, message) => {
        const { res } = await submit(newUser(), fields)
        expect(res.status).toBe(400)
        expect((await res.json()).message).toBe(message)
        expect(fakeDb.rows("consent_events")).toEqual([])
    })

    it("allows five attempts a day", async () => {
        const userId = newUser()
        for (let i = 0; i < 5; i++) await submit(userId, { kind: "passport", front: await jpeg(await photo(100, 100)), consent: "yes" })
        const { res } = await submit(userId, await passport())
        expect(res.status).toBe(429)
    })

    it("doesn't start if the consent can't be recorded", async () => {
        fakeDb.failOn("consent_events")
        const { res } = await submit(newUser(), await passport())
        expect(res.status).toBe(500)
        expect(modelCalls).toEqual([])
    })
})

describe("POST /api/verification: passports", () => {
    it("verifies a passport, storing only encrypted images and the outcome", async () => {
        const userId = newUser()
        fakeR2.put(BUCKET, `ids/${userId}/old-attempt/front.bin`, "older ID")
        const front = await photo()
        const { res, events } = await submit(userId, { kind: "passport", front: await jpeg(front), consent: "yes" })

        expect(res.headers.get("content-type")).toBe("application/x-ndjson")
        expect(events.filter((e) => e.type === "status").map((e) => e.text)).toEqual(["Preparing your photos", "Reading the machine-readable zone", "Checking the details", "Encrypting and saving"])
        expect(result(events)).toEqual({ type: "result", ok: true, documentType: "passport", issuingCountry: "CAN", expiresOn: "2035-01-15" })
        expect(modelCalls).toEqual(["mrz"])

        // the new attempt's file replaced the old one, and isn't readable as a JPEG
        const keys = fakeR2.keys(BUCKET)
        expect(keys).toEqual([expect.stringMatching(new RegExp(`^ids/${userId}/[0-9a-f-]{36}/front\\.bin$`))])
        const stored = fakeR2.get(BUCKET, keys[0])!
        expect(stored.subarray(0, 5).toString()).toBe("PXID1")
        expect(stored.includes(front.subarray(0, 64))).toBe(false)

        expect(record(userId)).toMatchObject({ status: "verified", document_type: "passport", issuing_country: "CAN", expires_on: "2035-01-15", object_keys: keys, key_version: 1, fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) })
        expect(JSON.stringify(record(userId))).not.toContain("AB1234567")
        expect(fakeDb.rows("consent_events")).toEqual([expect.objectContaining({ user_id: userId, source: "id_verification", age_confirmed: false, user_agent: "vitest-browser" })])

        expect(await status(userId)).toMatchObject({ status: { state: "verified", documentType: "passport", issuingCountry: "CAN", reason: null }, available: true })
    })

    it("falls back to reading the whole page when the focused MRZ read fails", async () => {
        const [mrz_line_1, mrz_line_2] = passportMrz()
        mrzRead = { line_1: "garbage", line_2: "" }
        documentRead = { ...documentRead, document_type: "passport", mrz_line_1, mrz_line_2 }
        const { events } = await submit(newUser(null), await passport())
        expect(result(events)).toMatchObject({ ok: true })
        expect(modelCalls).toEqual(["mrz", "document"])
    })

    it.each([
        [{ is_identity_document: true, document_type: "passport" }, /^We couldn't read the two lines of code/],
        [{ is_identity_document: false, document_type: "other" }, /^That doesn't look like a passport photo page/],
    ])("rejects a page whose code can't be read (%j)", async (reading, reason) => {
        mrzRead = { line_1: "", line_2: "" }
        documentRead = { ...reading, mrz_line_1: "P<UTO", mrz_line_2: "123" }
        const userId = newUser()
        const { events } = await submit(userId, await passport())
        expect(result(events)).toEqual({ type: "result", ok: false, reason: expect.stringMatching(reason) })
        // the rejection is remembered (with its reason), the photos aren't
        expect(record(userId)).toMatchObject({ status: "rejected", rejection_reason: expect.stringMatching(reason), object_keys: [], fingerprint: null })
        expect(fakeR2.keys(BUCKET)).toEqual([])
        expect((await status(userId)).status).toMatchObject({ state: "rejected", reason: expect.stringMatching(reason) })
    })

    it("treats an unreadable model reply as nothing read", async () => {
        vi.mocked(fetch).mockImplementation(async () => Response.json({ message: { content: "I think this is a passport!" } }))
        const { events } = await submit(newUser(), await passport())
        expect(result(events)).toMatchObject({ ok: false, reason: expect.stringMatching(/^That doesn't look like a passport/) })
    })

    it.each([
        [{ expiry: "200115" }, 36, "That document has expired. Use one that's still valid."],
        [{ birth: "150115" }, null, "You must be 18 or older to use ProgressX."],
        [{}, 25, "The birth date on this document doesn't match the age on your profile. If your profile age is wrong, fix it in Settings first."],
    ])("rejects %j (profile age %s)", async (dates, age, reason) => {
        const [line_1, line_2] = passportMrz(dates)
        mrzRead = { line_1, line_2 }
        const { events } = await submit(newUser(age), await passport())
        expect(result(events)).toEqual({ type: "result", ok: false, reason })
    })

    it("rejects photos too small to read", async () => {
        const { events } = await submit(newUser(), { kind: "passport", front: await jpeg(await photo(800, 500)), consent: "yes" })
        expect(result(events)).toMatchObject({ ok: false, reason: "The passport photo is too small to read. Use your camera at full resolution." })
        expect(modelCalls).toEqual([])
    })

    it("won't verify a second account with the same document", async () => {
        const first = newUser()
        expect(result((await submit(first, await passport())).events)).toMatchObject({ ok: true })
        const second = newUser()
        const { events } = await submit(second, await passport())
        expect(result(events)).toEqual({ type: "result", ok: false, reason: "This document is already verifying another ProgressX account." })
        expect(fakeR2.keys(BUCKET).every((key) => key.startsWith(`ids/${first}/`))).toBe(true)
    })

    it("cleans up when two accounts race to verify the same document", async () => {
        fakeDb.failOn("id_verifications", "upsert", { code: "23505", message: "duplicate key value violates unique constraint" })
        const { events } = await submit(newUser(), await passport())
        expect(result(events)).toMatchObject({ ok: false, reason: "This document is already verifying another ProgressX account." })
        expect(fakeR2.keys(BUCKET)).toEqual([])
    })

    it("keeps a current verification when a new attempt is rejected", async () => {
        const userId = newUser()
        await submit(userId, await passport())
        const [line_1, line_2] = passportMrz({ number: "ZZ9999999", expiry: "200101" })
        mrzRead = { line_1, line_2 }
        const { events } = await submit(userId, await passport())
        expect(result(events)).toMatchObject({ ok: false })
        expect(record(userId)).toMatchObject({ status: "verified" })
        expect(fakeR2.keys(BUCKET)).toHaveLength(1)
    })

    it.each([
        ["the model is down", () => { modelStatus = 500 }],
        ["storage fails", () => { fakeR2.failures.set("PutObjectCommand", new Error("R2 503")) }],
        ["saving the outcome fails", () => { fakeDb.failOn("id_verifications", "upsert") }],
    ])("says to try again later when %s, leaving no files behind", async (_case, breakIt) => {
        breakIt()
        const userId = newUser()
        const { events } = await submit(userId, await passport())
        expect(result(events)).toEqual({ type: "result", ok: false, reason: "We couldn't check your document right now. Try again in a few minutes." })
        expect(fakeR2.keys(BUCKET)).toEqual([])
        expect(record(userId)).toBeUndefined()
    })
})

describe("POST /api/verification: licences and ID cards", () => {
    it("verifies a card whose front matches its barcode", async () => {
        const userId = newUser()
        const { events } = await submit(userId, await card())
        expect(events.filter((e) => e.type === "status").map((e) => e.text)).toContain("Reading the barcode on the back")
        expect(result(events)).toEqual({ type: "result", ok: true, documentType: "drivers_licence", issuingCountry: "CAN-ON", expiresOn: "2035-01-15" })
        expect(fakeR2.keys(BUCKET).map((key) => key.split("/").pop())).toEqual(["back.bin", "front.bin"])
        expect(record(userId)).toMatchObject({ document_type: "drivers_licence", issuing_country: "CAN-ON" })
    })

    it("accepts a front where only the expiry date could be read", async () => {
        documentRead = { ...documentRead, date_of_birth: "" }
        expect(result((await submit(newUser(), await card())).events)).toMatchObject({ ok: true })
    })

    it.each([
        [[], /^We couldn't read the barcode on the back of your card/],
        [[{ isValid: false, text: aamva() }, { isValid: true, text: "not a licence" }], /^We couldn't read the barcode/],
    ])("rejects a back whose barcode can't be read", async (barcodes, reason) => {
        vi.mocked(readBarcodes).mockResolvedValue(barcodes as never)
        expect(result((await submit(newUser(), await card())).events)).toMatchObject({ ok: false, reason: expect.stringMatching(reason) })
    })

    it.each([
        [{ is_identity_document: true, document_type: "id_card" }, /^The front and back don't look like the same card/],
        [{ is_identity_document: true, document_type: "passport" }, /^The front photo doesn't look like a driver's licence or ID card/],
    ])("rejects a front that doesn't match the barcode (%j)", async (reading, reason) => {
        documentRead = { ...reading, date_of_birth: "1985-05-05", expiry_date: "2031-01-01" }
        expect(result((await submit(newUser(), await card())).events)).toMatchObject({ ok: false, reason: expect.stringMatching(reason) })
    })

    it("needs the back of a card", async () => {
        const outcome = await verifyDocument(newUser(), "card", { front: await photo(), back: null }, new AbortController().signal, () => {})
        expect(outcome).toEqual({ ok: false, reason: "Add a photo of the back of your card too." })
    })

    it("runs one check at a time per account", async () => {
        const userId = newUser()
        let release = () => {}
        vi.mocked(readBarcodes).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([{ isValid: true, text: aamva() }] as never) }))
        const first = verifyDocument(userId, "card", { front: await photo(), back: await photo() }, new AbortController().signal, () => {})
        await vi.waitFor(() => expect(readBarcodes).toHaveBeenCalled())
        expect(await verifyDocument(userId, "passport", { front: await photo(), back: null }, new AbortController().signal, () => {})).toEqual({ ok: false, reason: "A check is already running for your account." })
        release()
        expect(await first).toMatchObject({ ok: true })
    })
})

describe("GET /api/verification", () => {
    it("requires a signed-in user", async () => {
        expect((await GET(await apiRequest("/api/verification"))).status).toBe(401)
    })

    it("reports no verification, and whether it's available", async () => {
        vi.stubEnv("ID_FINGERPRINT_KEY", "")
        const res = await GET(await apiRequest("/api/verification", { userId: newUser() }))
        expect(res.headers.get("cache-control")).toBe("no-store")
        expect(await res.json()).toEqual({ status: { state: "none", documentType: null, issuingCountry: null, expiresOn: null, verifiedAt: null, reason: null }, available: false })
    })

    it("reports a verification whose document has since expired", async () => {
        const userId = newUser()
        fakeDb.seed("id_verifications", [{ user_id: userId, status: "verified", document_type: "passport", issuing_country: "CAN", expires_on: "2020-01-01", verified_at: "2019-06-01T00:00:00Z", rejection_reason: null }])
        expect((await status(userId)).status).toMatchObject({ state: "expired", expiresOn: "2020-01-01" })
    })

    it("reports errors", async () => {
        fakeDb.failOn("id_verifications")
        expect((await GET(await apiRequest("/api/verification", { userId: newUser() }))).status).toBe(500)
    })
})

describe("DELETE /api/verification", () => {
    const remove = async (userId: string | null) => DELETE(await apiRequest("/api/verification", { method: "DELETE", userId }))

    it("requires a signed-in user", async () => {
        expect((await remove(null)).status).toBe(401)
    })

    it("removes every ID file of the user, then the record", async () => {
        const userId = newUser()
        const other = newUser()
        await submit(userId, await passport())
        fakeR2.put(BUCKET, `ids/${userId}/stray/back.bin`, "x")
        fakeR2.put(BUCKET, `ids/${other}/a/front.bin`, "y")
        fakeR2.listPageSize = 1

        const res = await remove(userId)
        expect(await res.json()).toEqual({ message: "Your ID has been removed" })
        expect(fakeR2.keys(BUCKET)).toEqual([`ids/${other}/a/front.bin`])
        expect(record(userId)).toBeUndefined()
    })

    it("changes nothing when the files can't be removed", async () => {
        const userId = newUser()
        await submit(userId, await passport())
        fakeR2.failures.set("ListObjectsV2Command", new Error("R2 down"))
        expect((await remove(userId)).status).toBe(502)
        expect(record(userId)).toMatchObject({ status: "verified" })
    })

    it("reports a record that can't be removed", async () => {
        const userId = newUser()
        fakeDb.failOn("id_verifications", "delete")
        expect((await remove(userId)).status).toBe(502)
    })
})
