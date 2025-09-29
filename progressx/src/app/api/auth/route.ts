import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json(
        { message: "auth route online" },
        { status: 200 }
    )
}

export async function POST(request: Request) {
    const body = await request.json()

    const { username, password } = body
}