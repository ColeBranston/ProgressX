import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { cleanImage, cloudinaryImageOptions, imageDataUri, sniffImageFormat, userImageTag } from "@/app/api/libs/imageUpload"
import { inspectVideo } from "@/app/api/libs/r2Videos"
import { getPublicIdFromCloudinaryUrl } from "@/app/api/libs/helpers"
import { cloudinaryBlurredFull, cloudinaryLoader, cloudinaryThumbLoader, cloudinaryUrl } from "@/app/internal_components/profile/cloudinaryImage"
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from "@/app/internal_components/videos/videoTypes"

const bytes = (...parts: (string | number[])[]) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)))
const pad = (u: Uint8Array, n = 12) => new Uint8Array([...u, ...new Array(Math.max(0, n - u.length)).fill(0)])

describe("sniffImageFormat", () => {
    it.each([
        ["jpeg", pad(bytes([0xff, 0xd8, 0xff, 0xe0]))],
        ["png", pad(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))],
        ["webp", bytes("RIFF", [0, 0, 0, 0], "WEBP")],
        ["gif", pad(bytes("GIF89a"))],
        ["avif", bytes([0, 0, 0, 0x1c], "ftypavif")],
        ["heif", bytes([0, 0, 0, 0x1c], "ftypheic")],
    ])("recognises %s by its bytes", (format, data) => {
        expect(sniffImageFormat(data)).toBe(format)
    })
    it("rejects other files, whatever they are called", () => {
        expect(sniffImageFormat(bytes("%PDF-1.7 hello"))).toBeNull()
        expect(sniffImageFormat(bytes([0, 0, 0, 0x1c], "ftypisom"))).toBeNull() // an MP4, not an image
        expect(sniffImageFormat(bytes([0xff, 0xd8]))).toBeNull() // too short
    })
})

describe("cleanImage", () => {
    it("re-encodes to a JPEG within the size limit and strips metadata", async () => {
        const png = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#3366ff" } })
            .withMetadata({ exif: { IFD0: { Copyright: "secret GPS" } } }).png().toBuffer()
        const out = await cleanImage(png, { maxDimension: 400 })
        const meta = await sharp(out).metadata()
        expect(meta).toMatchObject({ format: "jpeg", width: 400, height: 200 })
        expect(meta.exif).toBeUndefined()
        expect(imageDataUri(out)).toMatch(/^data:image\/jpeg;base64,\/9j\//)
    })
    it("refuses bytes that aren't an image", async () => {
        await expect(cleanImage(Buffer.from("definitely not an image at all"), { maxDimension: 100 })).rejects.toThrow()
    })
    it("tags uploads with the owner so account deletion can find them", () => {
        expect(userImageTag("u1")).toBe("user_u1")
        expect(cloudinaryImageOptions("u1")).toEqual({ folder: "uploads", resource_type: "image", allowed_formats: ["jpg"], tags: ["user_u1"] })
    })
})

// ---------- MP4 box structure ----------

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const box = (type: string, body: number[]) => [...u32(8 + body.length), ...Buffer.from(type, "latin1"), ...body]
const mvhd = (timescale: number, duration: number) => box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(timescale), ...u32(duration), ...new Array(80).fill(0)])
function mp4({ brand = "isom", seconds = 10, moovFirst = true } = {}) {
    const ftyp = box("ftyp", [...Buffer.from(brand, "latin1"), ...u32(0), ...Buffer.from("isommp41", "latin1")])
    const moov = box("moov", mvhd(1000, seconds * 1000))
    const mdat = box("mdat", new Array(64).fill(7))
    return new Uint8Array(moovFirst ? [...ftyp, ...moov, ...mdat] : [...ftyp, ...mdat, ...moov])
}
const reader = (file: Uint8Array) => async (start: number, end: number) => file.slice(start, end + 1)

describe("inspectVideo", () => {
    it("reads the length of an MP4 from moov > mvhd", async () => {
        const file = mp4({ seconds: 42 })
        expect(await inspectVideo(file.length, reader(file))).toEqual({ ok: true, sizeBytes: file.length, durationS: 42, contentType: "video/mp4" })
    })
    it("finds moov after mdat and recognises QuickTime", async () => {
        const file = mp4({ brand: "qt  ", moovFirst: false })
        expect(await inspectVideo(file.length, reader(file))).toMatchObject({ ok: true, contentType: "video/quicktime" })
    })
    it("rejects videos over the length limit", async () => {
        const file = mp4({ seconds: MAX_VIDEO_SECONDS + 5 })
        expect(await inspectVideo(file.length, reader(file))).toEqual({ ok: false, reason: "too_long" })
    })
    it("rejects files that aren't videos, or are empty or too big", async () => {
        const jpeg = pad(bytes([0xff, 0xd8, 0xff, 0xe0]), 64)
        expect(await inspectVideo(jpeg.length, reader(jpeg))).toEqual({ ok: false, reason: "not_video" })
        expect(await inspectVideo(0, reader(jpeg))).toEqual({ ok: false, reason: "missing" })
        expect(await inspectVideo(MAX_VIDEO_BYTES + 1, reader(jpeg))).toEqual({ ok: false, reason: "too_big" })
    })
    it("rejects a truncated file whose boxes run past the end", async () => {
        const file = mp4().slice(0, 40)
        expect(await inspectVideo(file.length, reader(file))).toEqual({ ok: false, reason: "unreadable" })
    })
})

describe("Cloudinary URLs", () => {
    const src = "https://res.cloudinary.com/demo/image/upload/v123/uploads/a.jpg"
    it("inserts transformations after /upload/", () => {
        expect(cloudinaryUrl(src, "w_10")).toBe("https://res.cloudinary.com/demo/image/upload/w_10/v123/uploads/a.jpg")
        expect(cloudinaryLoader({ src, width: 400, quality: 70 })).toContain("/upload/c_limit,w_400,f_auto,q_70/")
        expect(cloudinaryThumbLoader({ src, width: 200 })).toContain("ar_3:4,w_200,f_auto,q_auto/")
        expect(cloudinaryBlurredFull(src)).toContain("e_blur:2000")
    })
    it("leaves other hosts alone", () => {
        expect(cloudinaryUrl("https://example.com/upload/a.jpg", "w_10")).toBe("https://example.com/upload/a.jpg")
    })
    it("gets the public id back out of a delivery URL", () => {
        expect(getPublicIdFromCloudinaryUrl(src)).toBe("uploads/a")
    })
})
