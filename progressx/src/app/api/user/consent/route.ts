import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "../../libs/helpers";
import { isValidConsent, recordConsent } from "../../libs/consent";

// POST /api/user/consent  { acceptedTerms: true, confirmedAge: true, termsVersion }
// Records agreement to the current terms + privacy policy and the 18+ confirmation, for accounts
// that don't have it yet (first Google sign-in, accounts from before consent was recorded, or after
// the terms change).
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!isValidConsent(body)) {
        return NextResponse.json({ message: "Confirm you're 18 or older and agree to the current Terms of Service and Privacy Policy" }, { status: 400 })
    }

    try {
        await recordConsent(userId, "reconsent", req.headers.get("user-agent"))
        return NextResponse.json({ message: "Agreement recorded" })
    } catch (e) {
        console.log("Error recording consent: ", e)
        return NextResponse.json({ message: "Couldn't save your agreement, please try again" }, { status: 500 })
    }
}
