import { NextResponse } from "next/server";
import { isVerified } from "./idVerification";

// Posting and interacting (uploading videos, likes, favourites, follows) needs a verified ID; browsing
// and private tracking don't. Returns the response to send when the user isn't verified, else null.
export async function requireVerified(userId: string, action: string): Promise<NextResponse | null> {
    if (await isVerified(userId)) return null
    return NextResponse.json(
        { code: "verification_required", message: `Verify your ID in Settings to ${action}.` },
        { status: 403 },
    )
}
