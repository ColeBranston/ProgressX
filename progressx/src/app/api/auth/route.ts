import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json(
        { message: "auth route online" },
        { status: 200 }
    )
}