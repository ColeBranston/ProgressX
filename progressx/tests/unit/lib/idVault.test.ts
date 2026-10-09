import { randomBytes } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
    decryptDocument, documentFingerprint, encryptDocument, idPrefix, newDataKey, unwrapDataKey,
    vaultConfigured, VaultNotConfiguredError, wipe,
} from "@/app/api/libs/idVault"

const key = () => randomBytes(32).toString("base64")
const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
    vi.stubEnv("ID_ENCRYPTION_KEY", key())
    vi.stubEnv("ID_ENCRYPTION_KEY_VERSION", "1")
    vi.stubEnv("ID_FINGERPRINT_KEY", key())
})

describe("envelope encryption", () => {
    const image = Buffer.from("pretend this is a JPEG of a passport")
    const slot = `${idPrefix(alice)}attempt/front.bin`

    it("round-trips an image through a wrapped data key", () => {
        const { dataKey, wrapped } = newDataKey(alice)
        const sealed = encryptDocument(alice, slot, dataKey, image)
        expect(sealed.subarray(0, 5).toString()).toBe("PXID1")
        expect(sealed.includes(image)).toBe(false)
        expect(decryptDocument(alice, slot, unwrapDataKey(alice, wrapped), sealed)).toEqual(image)
    })

    it("uses a fresh IV every time", () => {
        const { dataKey } = newDataKey(alice)
        expect(encryptDocument(alice, slot, dataKey, image).equals(encryptDocument(alice, slot, dataKey, image))).toBe(false)
    })

    it("refuses tampered ciphertext", () => {
        const { dataKey } = newDataKey(alice)
        const sealed = encryptDocument(alice, slot, dataKey, image)
        sealed[sealed.length - 1] ^= 1
        expect(() => decryptDocument(alice, slot, dataKey, sealed)).toThrow()
    })

    it("refuses a file moved to another user or slot", () => {
        const { dataKey } = newDataKey(alice)
        const sealed = encryptDocument(alice, slot, dataKey, image)
        expect(() => decryptDocument(bob, slot, dataKey, sealed)).toThrow()
        expect(() => decryptDocument(alice, slot.replace("front", "back"), dataKey, sealed)).toThrow()
    })

    it("only unwraps a data key for the user it was made for", () => {
        const { wrapped } = newDataKey(alice)
        expect(() => unwrapDataKey(bob, wrapped)).toThrow()
    })

    it("refuses files that aren't ProgressX ID files", () => {
        expect(() => decryptDocument(alice, slot, randomBytes(32), Buffer.from("plain bytes"))).toThrow("Not an encrypted ProgressX ID file")
    })

    it("still opens keys wrapped with a retired master key after rotation", () => {
        const old = process.env.ID_ENCRYPTION_KEY!
        const { dataKey, wrapped } = newDataKey(alice)
        vi.stubEnv("ID_ENCRYPTION_KEY_V1", old)
        vi.stubEnv("ID_ENCRYPTION_KEY", key())
        vi.stubEnv("ID_ENCRYPTION_KEY_VERSION", "2")
        expect(unwrapDataKey(alice, wrapped)).toEqual(dataKey)
        expect(newDataKey(alice).wrapped.version).toBe(2)
    })

    it("fails closed without a master key", () => {
        vi.stubEnv("ID_ENCRYPTION_KEY", "")
        expect(() => newDataKey(alice)).toThrow(VaultNotConfiguredError)
    })
})

describe("documentFingerprint", () => {
    it("is stable across formatting but never contains the number", () => {
        const a = documentFingerprint("passport", "can", "ab 123-456")
        expect(a).toBe(documentFingerprint("passport", "CAN", "AB123456"))
        expect(a).toMatch(/^[0-9a-f]{64}$/)
        expect(a).not.toContain("123456")
    })
    it("differs per document type, issuer and key", () => {
        const a = documentFingerprint("passport", "CAN", "AB123456")
        expect(documentFingerprint("drivers_licence", "CAN", "AB123456")).not.toBe(a)
        expect(documentFingerprint("passport", "USA", "AB123456")).not.toBe(a)
        vi.stubEnv("ID_FINGERPRINT_KEY", key())
        expect(documentFingerprint("passport", "CAN", "AB123456")).not.toBe(a)
    })
})

describe("vaultConfigured / wipe", () => {
    it("needs both keys and the ID bucket credentials", () => {
        vi.stubEnv("R2_ACCOUNT_ID", "acct")
        vi.stubEnv("R2_ID_ACCESS_KEY_ID", "")
        vi.stubEnv("R2_ID_SECRET_ACCESS_KEY", "")
        expect(vaultConfigured()).toBe(false)
        vi.stubEnv("R2_ID_ACCESS_KEY_ID", "id")
        vi.stubEnv("R2_ID_SECRET_ACCESS_KEY", "secret")
        expect(vaultConfigured()).toBe(true)
        vi.stubEnv("ID_FINGERPRINT_KEY", "too-short")
        expect(vaultConfigured()).toBe(false)
    })
    it("zeroes buffers and skips missing ones", () => {
        const buffer = Buffer.from("secret")
        wipe(buffer, null, undefined)
        expect([...buffer]).toEqual([0, 0, 0, 0, 0, 0])
    })
})
