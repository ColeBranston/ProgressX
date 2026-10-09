import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "../../../libs/helpers";
import { followList, profileFromRoute } from "../../../libs/follows";

// GET /api/profiles/:username/followers  |  /api/profiles/:username/following   (?cursor=)
//   -> { people: [{ username, name, pfp, privacy, isOwner, following }], nextCursor }
// ("me" works as the username.) Shown for public profiles, and always to the profile's owner.
export async function GET(req: NextRequest, context: { params: Promise<{ username: string, list: string }> }) {
    const viewerId = await getUserIdFromRequest(req)
    if (!viewerId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const { username, list } = await context.params
    if (list !== "followers" && list !== "following") return NextResponse.json({ message: "Not found" }, { status: 404 })
    const offset = Number(new URL(req.url).searchParams.get("cursor") ?? 0)
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) return NextResponse.json({ message: "Bad cursor" }, { status: 400 })

    try {
        const profile = await profileFromRoute(username, viewerId)
        if (!profile) return NextResponse.json({ message: "No such profile" }, { status: 404 })
        if (profile.id !== viewerId && profile.profile_privacy !== "public") {
            return NextResponse.json({ private: true, people: [], nextCursor: null }, { status: 403 })
        }
        return NextResponse.json(await followList(profile.id, list, viewerId, offset))
    } catch (e) {
        console.log("Error listing follows: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Couldn't load that list" }, { status: 500 })
    }
}
