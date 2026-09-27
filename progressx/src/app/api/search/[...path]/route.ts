import { NextRequest, NextResponse } from "next/server"

// Proxies /api/search/* to the search backend so its URL stays a runtime env var
export async function GET(req: NextRequest) {
    const backendUrl = process.env.SEARCH_BACKEND_URL
    if (!backendUrl) {
        return NextResponse.json({ error: "SEARCH_BACKEND_URL is not set" }, { status: 500 })
    }

    // keep the path exactly as the client encoded it
    const path = req.nextUrl.pathname.replace(/^\/api\/search/, "")

    try {
        const response = await fetch(`${backendUrl.replace(/\/$/, "")}${path}${req.nextUrl.search}`, { cache: "no-store" })
        return new NextResponse(response.body, {
            status: response.status,
            headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
        })
    } catch (e) {
        console.log("Search backend request failed: ", e)
        return NextResponse.json({ error: "Search backend unavailable" }, { status: 502 })
    }
}
