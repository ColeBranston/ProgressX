import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { encoder } from "./login/google/route";
import { redirect } from "next/dist/server/api-utils";

export async function GET(req: NextRequest) {
    const token = req.cookies.get("token")?.value

    try {
        if (token) {
            const decryptedToken = await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET))
            console.log(decryptedToken)
            const email = decryptedToken?.payload?.email
            return NextResponse.json({ user: email}, {status : 200})
        } else {
            throw new Error("Missing Token")
        }
    } catch(e) {
        return NextResponse.json({ message: "No or invalid token"}, { status: 401 })
    }
}   