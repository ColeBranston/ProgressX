import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../libs/helpers";
import { followingSet } from "../libs/follows";
import { PAGE_SIZE, VIDEO_WITH_AUTHOR, VideoRowWithAuthor, canView, overLimit, toCards } from "../libs/videos";

const MAX_QUERY = 80
const MAX_OFFSET = 600
const PROFILE_PAGE = 20

type ProfileRow = {
    id: string,
    display_username: string,
    display_name: string | null,
    profile_image: string | null,
    profile_privacy: string | null,
    followers_count: number | null,
}

// A value for a PostgREST ilike filter inside or(): wildcards in the search are matched literally,
// and the whole value is quoted so commas / brackets in it can't change the filter
function containsPattern(q: string) {
    const literal = q.replace(/[\\%_]/g, (c) => `\\${c}`)
    return `"%${literal.replace(/["\\]/g, (c) => `\\${c}`)}%"`
}

// GET /api/find?q=...&type=videos|profiles&cursor=...
//   videos:   { videos: VideoCard[], nextCursor }   captions or poster's username / name containing q;
//             only videos the viewer may see (public profiles, plus their own), newest first
//   profiles: { profiles: [...], nextCursor }        username or name containing q, best matches first;
//             private profiles are listed too (as on their profile page), their videos are not
export async function GET(req: NextRequest) {
    const viewerId = await getUserIdFromRequest(req)
    if (!viewerId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const params = new URL(req.url).searchParams
    const q = (params.get("q") ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY)
    const type = params.get("type") ?? "videos"
    const offset = Number(params.get("cursor") ?? 0)
    if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) return NextResponse.json({ message: "Bad cursor" }, { status: 400 })
    if (type !== "videos" && type !== "profiles") return NextResponse.json({ message: "type must be videos or profiles" }, { status: 400 })
    if (!q) return NextResponse.json(type === "videos" ? { videos: [], nextCursor: null } : { profiles: [], nextCursor: null })
    if (overLimit(`find:${viewerId}`, 60, 60 * 1000)) return NextResponse.json({ message: "Too many searches, slow down a little" }, { status: 429 })

    try {
        return NextResponse.json(type === "profiles" ? await findProfiles(q, offset, viewerId) : await findVideos(q, offset, viewerId))
    } catch (e) {
        console.log("Search failed: ", e instanceof Error ? e.message : e)
        return NextResponse.json({ message: "Search isn't working right now" }, { status: 500 })
    }
}

async function matchingProfiles(q: string, limit: number) {
    const pattern = containsPattern(q)
    const { data, error } = await supabase
        .from("profiles")
        .select("id, display_username, display_name, profile_image, profile_privacy, followers_count")
        .not("display_username", "is", null)
        .eq("isOnboarded", true)
        .or(`display_username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(limit)
    if (error) throw error
    return (data ?? []) as ProfileRow[]
}

async function findProfiles(q: string, offset: number, viewerId: string) {
    // fetch every candidate up to the cap, rank in code (exact username, then starts-with, then the rest)
    const rows = await matchingProfiles(q, MAX_OFFSET + PROFILE_PAGE)
    const lower = q.toLowerCase()
    const rank = (p: ProfileRow) => {
        const username = p.display_username.toLowerCase()
        const name = (p.display_name ?? "").toLowerCase()
        if (username === lower) return 0
        if (username.startsWith(lower)) return 1
        if (name.startsWith(lower) || name.includes(` ${lower}`)) return 2
        return 3
    }
    rows.sort((a, b) => rank(a) - rank(b) || (b.followers_count ?? 0) - (a.followers_count ?? 0) || a.display_username.localeCompare(b.display_username))
    const page = rows.slice(offset, offset + PROFILE_PAGE)
    const follows = await followingSet(viewerId, page.map((p) => p.id))
    return {
        profiles: page.map((p) => ({
            username: p.display_username,
            name: p.display_name ?? "",
            pfp: p.profile_image,
            privacy: p.profile_privacy === "public" ? "public" : "private",
            followers: p.followers_count ?? 0,
            isOwner: p.id === viewerId,
            following: follows.has(p.id),
        })),
        nextCursor: rows.length > offset + PROFILE_PAGE ? String(offset + PROFILE_PAGE) : null,
    }
}

async function findVideos(q: string, offset: number, viewerId: string) {
    // videos match on their caption, or on who posted them
    const authors = (await matchingProfiles(q, 200)).filter((p) => p.profile_privacy === "public" || p.id === viewerId).map((p) => p.id)
    const filters = [`caption.ilike.${containsPattern(q)}`, ...(authors.length ? [`user_id.in.(${authors.join(",")})`] : [])]

    const { data, error } = await supabase
        .from("videos")
        .select(VIDEO_WITH_AUTHOR)
        .eq("status", "ready")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE * 3) // a few spare rows: private ones are dropped below
    if (error) throw error

    const rows = ((data ?? []) as unknown as VideoRowWithAuthor[])
    const visible = rows.filter((row) => canView(row, row.profiles, viewerId))
    const page = visible.slice(0, PAGE_SIZE)
    // the next page starts after the last row this page looked at
    const consumed = page.length ? rows.indexOf(page[page.length - 1]) + 1 : rows.length
    const more = rows.length > PAGE_SIZE * 3 || visible.length > PAGE_SIZE
    return {
        videos: await toCards(page, viewerId),
        nextCursor: more && offset + consumed <= MAX_OFFSET ? String(offset + consumed) : null,
    }
}
