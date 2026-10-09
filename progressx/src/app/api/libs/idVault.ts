import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Encrypted storage for government ID images (envelope encryption).
//
//  - Every verification gets its own random 256-bit data key. Each image is encrypted with it using
//    AES-256-GCM (authenticated: any change to the stored bytes makes decryption fail), with the user id
//    and object key bound in as associated data, so a file can't be swapped between users or slots.
//  - The data key is itself encrypted ("wrapped") with the master key (ID_ENCRYPTION_KEY, server env
//    only) and stored in the database row. The ciphertext lives in a separate private R2 bucket with its
//    own access token. Reading an ID needs all three: the database, the bucket and the master key.
//  - Nothing here is reachable from the web: there is no route that decrypts or returns an image. Only
//    scripts/id-decrypt.mjs, run by hand on this machine, can read one back.
//  - Plaintext only ever exists in memory during the automated check, and the buffers are zeroed after.
//
// Env: ID_ENCRYPTION_KEY (32 bytes, base64), ID_ENCRYPTION_KEY_VERSION, ID_FINGERPRINT_KEY (32 bytes,
// base64), R2_ACCOUNT_ID, R2_ID_BUCKET, R2_ID_ACCESS_KEY_ID, R2_ID_SECRET_ACCESS_KEY.
// Key rotation: keep the old key as ID_ENCRYPTION_KEY_V<n> and bump ID_ENCRYPTION_KEY_VERSION.

const MAGIC = Buffer.from("PXID1")
const IV_BYTES = 12
const TAG_BYTES = 16

export class VaultNotConfiguredError extends Error {
    constructor() { super("ID storage isn't configured") }
}

function decodeKey(value: string | undefined): Buffer | null {
    if (!value) return null
    const key = Buffer.from(value, "base64")
    return key.length === 32 ? key : null
}

export function vaultConfigured() {
    return Boolean(
        decodeKey(process.env.ID_ENCRYPTION_KEY) && decodeKey(process.env.ID_FINGERPRINT_KEY) &&
        process.env.R2_ACCOUNT_ID && process.env.R2_ID_ACCESS_KEY_ID && process.env.R2_ID_SECRET_ACCESS_KEY,
    )
}

const currentVersion = () => Number(process.env.ID_ENCRYPTION_KEY_VERSION || 1)

function masterKey(version: number): Buffer {
    const key = version === currentVersion()
        ? decodeKey(process.env.ID_ENCRYPTION_KEY)
        : decodeKey(process.env[`ID_ENCRYPTION_KEY_V${version}`])
    if (!key) throw new VaultNotConfiguredError()
    return key
}

function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES })
    cipher.setAAD(Buffer.from(aad))
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body])
}

function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
    const iv = sealed.subarray(0, IV_BYTES)
    const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()])
}

// ---------- data keys ----------

export type WrappedKey = { wrapped: string, version: number }

export function newDataKey(userId: string): { dataKey: Buffer, wrapped: WrappedKey } {
    const dataKey = randomBytes(32)
    const version = currentVersion()
    const wrapped = seal(masterKey(version), dataKey, `progressx-id-key|${userId}|v${version}`).toString("base64")
    return { dataKey, wrapped: { wrapped, version } }
}

export function unwrapDataKey(userId: string, { wrapped, version }: WrappedKey): Buffer {
    return open(masterKey(version), Buffer.from(wrapped, "base64"), `progressx-id-key|${userId}|v${version}`)
}

// ---------- documents ----------

export const idPrefix = (userId: string) => `ids/${userId}/`

export function encryptDocument(userId: string, objectKey: string, dataKey: Buffer, image: Buffer): Buffer {
    return Buffer.concat([MAGIC, seal(dataKey, image, `progressx-id|${userId}|${objectKey}`)])
}

export function decryptDocument(userId: string, objectKey: string, dataKey: Buffer, stored: Buffer): Buffer {
    if (!stored.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not an encrypted ProgressX ID file")
    return open(dataKey, stored.subarray(MAGIC.length), `progressx-id|${userId}|${objectKey}`)
}

// Keyed hash of a document's identity (type, issuer, number): the same ID always gives the same value,
// but the number can't be recovered from it without the fingerprint key
export function documentFingerprint(type: string, issuer: string, documentNumber: string): string {
    const key = decodeKey(process.env.ID_FINGERPRINT_KEY)
    if (!key) throw new VaultNotConfiguredError()
    const normalized = `${type}|${issuer.toUpperCase()}|${documentNumber.toUpperCase().replace(/[^A-Z0-9]/g, "")}`
    return createHmac("sha256", key).update(normalized).digest("hex")
}

// Best effort: overwrite plaintext in memory once it's no longer needed
export function wipe(...buffers: (Buffer | Uint8Array | null | undefined)[]) {
    for (const buffer of buffers) buffer?.fill(0)
}

// ---------- the private bucket ----------

let client: S3Client | null = null
function r2() {
    if (!vaultConfigured()) throw new VaultNotConfiguredError()
    if (!client) {
        client = new S3Client({
            region: "auto",
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId: process.env.R2_ID_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_ID_SECRET_ACCESS_KEY! },
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        })
    }
    return client
}

const bucket = () => process.env.R2_ID_BUCKET || "progressx-ids"

export async function putEncrypted(objectKey: string, sealed: Buffer) {
    await r2().send(new PutObjectCommand({
        Bucket: bucket(),
        Key: objectKey,
        Body: sealed,
        ContentType: "application/octet-stream",
        CacheControl: "no-store",
    }))
}

export async function getEncrypted(objectKey: string): Promise<Buffer> {
    const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey }))
    return Buffer.from(await res.Body!.transformToByteArray())
}

export async function deleteDocuments(keys: string[]) {
    if (!keys.length) return
    const res = await r2().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }))
    if (res.Errors?.length) throw new Error(`R2 couldn't delete ${res.Errors.length} ID file(s)`)
}

// Every stored ID file of one user (all attempts and slots), except any in `keep`; used when a new
// verification replaces an old one, by "remove my ID" and by account deletion
export async function deleteUserDocuments(userId: string, keep: string[] = []): Promise<number> {
    if (!vaultConfigured()) return 0
    let deleted = 0
    let token: string | undefined
    do {
        const page = await r2().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: idPrefix(userId), ContinuationToken: token }))
        const keys = (page.Contents ?? []).map((o) => o.Key!).filter((key) => key && !keep.includes(key))
        if (keys.length) {
            const res = await r2().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }))
            if (res.Errors?.length) throw new Error(`R2 couldn't delete ${res.Errors.length} ID file(s)`)
        }
        deleted += keys.length
        token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return deleted
}
