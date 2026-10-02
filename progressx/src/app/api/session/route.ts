import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "../libs/helpers";

// GET /api/session (not counted as activity)
// 200 while the login is still good, 401 once it has ended. Pages open for a long time poll this
// (see SessionWatch) so an expired login lands on the login screen instead of a half-working page.
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ ok: true })
}

// POST /api/session
// "Still here": sent by SessionWatch while someone is reading or scrolling without making other requests,
// so the 15-minute inactivity limit counts their activity (the middleware records it on every request
// except GET /api/session).
export async function POST(req: NextRequest) {
    return GET(req)
}
