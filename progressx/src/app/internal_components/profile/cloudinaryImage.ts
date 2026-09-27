import type { ImageLoaderProps } from "next/image"

const UPLOAD_SEGMENT = "/upload/"

// Inserts Cloudinary transformations into a delivery URL, e.g.
// .../image/upload/v123/uploads/a.jpg -> .../image/upload/w_400,f_auto,q_auto/v123/uploads/a.jpg
export function cloudinaryUrl(src: string, transformations: string) {
    const index = src.indexOf(UPLOAD_SEGMENT)
    if (!src.includes("res.cloudinary.com") || index === -1) return src

    const splitAt = index + UPLOAD_SEGMENT.length
    return `${src.slice(0, splitAt)}${transformations}/${src.slice(splitAt)}`
}

// next/image loader: Cloudinary resizes and picks the best format (AVIF/WebP) for each srcset width,
// so the browser never downloads the full-size original for a thumbnail
export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps) {
    return cloudinaryUrl(src, `c_limit,w_${width},f_auto,q_${quality ?? "auto"}`)
}

// Same, but cropped to the 3:4 portrait tile, keeping the most important part of the photo in frame
export function cloudinaryThumbLoader({ src, width, quality }: ImageLoaderProps) {
    return cloudinaryUrl(src, `c_fill,g_auto,ar_3:4,w_${width},f_auto,q_${quality ?? "auto"}`)
}

// Tiny blurred version (well under 1 KB) shown while the real image loads
export function cloudinaryPlaceholder(src: string) {
    return cloudinaryUrl(src, "c_fill,g_auto,ar_3:4,w_24,e_blur:400,q_30,f_auto")
}

// Heavily blurred versions shown while "blur progress photos" is on; the sharp photo is never downloaded
export function cloudinaryBlurredThumb(src: string) {
    return cloudinaryUrl(src, "c_fill,g_auto,ar_3:4,w_240,e_blur:2000,q_auto,f_auto")
}

export function cloudinaryBlurredFull(src: string) {
    return cloudinaryUrl(src, "c_limit,w_600,e_blur:2000,q_auto,f_auto")
}
