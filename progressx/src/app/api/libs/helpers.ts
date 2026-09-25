import { jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { encoder } from "@/app/api/auth/login/google/route";

export function getPublicIdFromCloudinaryUrl(url: string) {
    // remove domain + version + extension
    const parts = url.split("/upload/");
    const pathAndFile = parts[1]; // "v1698765432/uploads/my-image.jpg"
    const withoutVersion = pathAndFile.split("/").slice(1).join("/"); // "uploads/my-image.jpg"
    const publicId = withoutVersion.replace(/\.[^/.]+$/, ""); // remove extension
    return publicId;
  }

// Shared auth helper for the diet-tracking API routes: pulls the "token" cookie,
// verifies it the same way the existing /api/user and /api/auth routes do, and
// returns the signed-in user's id (profiles.id / auth.users.id), or null if
// the request isn't authenticated.
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const token = req.cookies?.get("token")?.value

    if (!token) return null

    try {
        const decoded = await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET!))
        const id = decoded?.payload?.sub

        return typeof id === "string" ? id : null
    } catch (e) {
        console.log("Error verifying token: ", e)
        return null
    }
}
