import { NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "./session";

export function getPublicIdFromCloudinaryUrl(url: string) {
    // remove domain + version + extension
    const parts = url.split("/upload/");
    const pathAndFile = parts[1]; // "v1698765432/uploads/my-image.jpg"
    const withoutVersion = pathAndFile.split("/").slice(1).join("/"); // "uploads/my-image.jpg"
    const publicId = withoutVersion.replace(/\.[^/.]+$/, ""); // remove extension
    return publicId;
  }

// Who's asking, for rate limits on pages anyone can use without signing in: the signed-in user, or
// the visitor's IP (Cloudflare and nginx pass it on)
export function requesterKey(req: NextRequest, userId: string | null): string {
    if (userId) return `user:${userId}`
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    return `ip:${ip || "unknown"}`
}

// Shared auth helper for API routes: verifies the access-token cookie (the middleware has
// already refreshed it if it was about to expire) and returns the signed-in user's id
// (profiles.id / auth.users.id), or null if the request isn't authenticated.
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const token = req.cookies?.get(ACCESS_COOKIE)?.value

    if (!token) return null

    try {
        return (await verifyAccessToken(token)).sub
    } catch (e) {
        console.log("Error verifying token: ", e instanceof Error ? e.message : e)
        return null
    }
}
