import sharp from "sharp";
import { NextRequest } from "next/server";

// Safety checks for user image uploads (progress photos, profile pictures).
//
// 1. Size: rejected from the Content-Length header before the body is read, and again on the file.
// 2. Type: decided from the file's own bytes (magic numbers), never from the name or the browser's
//    claimed MIME type. Only raster photo formats pass; SVG (can carry scripts), HTML, PDF, archives
//    and executables are refused even if renamed to .jpg.
// 3. Re-encoding: the image is fully decoded and a brand new JPEG is written from its pixels. Anything
//    hidden in or appended to the original (scripts, polyglot payloads, malformed chunks) doesn't
//    survive, and EXIF metadata such as GPS location is dropped. Decompression bombs are stopped by a
//    pixel limit.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB, matches the upload forms and nginx's body limit
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 256 * 1024 // form-data overhead
const MAX_INPUT_PIXELS = 50_000_000 // ~ 8660 x 5770; bigger is almost certainly a decompression bomb

type Format = "jpeg" | "png" | "webp" | "gif" | "heif" | "avif"

export class ImageUploadError extends Error {
    constructor(message: string, public status: number) {
        super(message)
    }
}

// Identify the format from the leading bytes
export function sniffImageFormat(bytes: Uint8Array): Format | null {
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
    if (bytes.length < 12) return null

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
    if (bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png"
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp"
    if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif"

    // ISO base media (HEIC / AVIF): "ftyp" box at offset 4, then the major brand
    if (ascii(4, 8) === "ftyp") {
        const brand = ascii(8, 12)
        if (["avif", "avis"].includes(brand)) return "avif"
        if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heif"
    }
    return null
}

type Options = {
    maxDimension: number, // longest side of the stored image
    quality?: number,
}

// Reads the "file" field of an upload and returns a clean, re-encoded JPEG, or throws ImageUploadError
export async function readSafeImageUpload(req: NextRequest, { maxDimension, quality = 86 }: Options): Promise<Buffer> {
    const declaredLength = Number(req.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
        throw new ImageUploadError("Images must be 10 MB or smaller", 413)
    }

    const formData = await req.formData().catch(() => null)
    const file = formData?.get("file")
    if (!(file instanceof File) || file.size === 0) {
        throw new ImageUploadError("An image file is required", 400)
    }
    if (file.size > MAX_IMAGE_BYTES) {
        throw new ImageUploadError("Images must be 10 MB or smaller", 413)
    }

    return cleanImage(Buffer.from(await file.arrayBuffer()), { maxDimension, quality })
}

// Checks an image's real format from its bytes and returns a brand new JPEG made from its pixels
// (steps 2 and 3 above), or throws ImageUploadError. Shared by every place users send images.
export async function cleanImage(input: Buffer, { maxDimension, quality = 86 }: Options): Promise<Buffer> {
    const format = sniffImageFormat(input)
    if (!format) {
        throw new ImageUploadError("That file isn't a supported image. Upload a JPG, PNG, WebP or HEIC photo.", 415)
    }

    try {
        return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false })
            .rotate() // apply the camera's orientation before the metadata is dropped
            .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" }) // transparent PNG/WebP -> white, since JPEG has no alpha
            .jpeg({ quality, mozjpeg: true })
            .toBuffer()
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.log(`Rejected ${format} upload that couldn't be decoded: ${message}`)
        if (format === "heif") {
            throw new ImageUploadError("This HEIC photo couldn't be read. Try exporting it as a JPG.", 415)
        }
        if (/pixel limit/i.test(message)) {
            throw new ImageUploadError("That image's dimensions are too large.", 413)
        }
        throw new ImageUploadError("That image is damaged or not a real image file.", 415)
    }
}

export function imageDataUri(jpeg: Buffer) {
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`
}

// Every image a user uploads is tagged with their id, so deleting the account can find all of them
// (even one whose database row was lost)
export function userImageTag(userId: string) {
    return `user_${userId}`
}

// Upload options: Cloudinary refuses anything that isn't an image in the formats we produce
export function cloudinaryImageOptions(userId: string) {
    return {
        folder: "uploads",
        resource_type: "image" as const,
        allowed_formats: ["jpg"],
        tags: [userImageTag(userId)],
    }
}
