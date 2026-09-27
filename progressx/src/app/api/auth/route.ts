import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "../libs/session";

export async function GET(req: NextRequest) {
    const token = req.cookies.get(ACCESS_COOKIE)?.value

    try {
        if (!token) throw new Error("Missing Token")

        const payload = await verifyAccessToken(token)
        return NextResponse.json({ user: payload.email }, { status: 200 })
    } catch(e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ message: "No or invalid token: " + errorMessage}, { status: 401 })
    }
}
