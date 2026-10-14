import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../libs/helpers";
import { cleanReleaseNotes, Release, shouldShowRelease } from "@/app/internal_components/releases/releases";

// GET /api/releases  ->  { release: Release | null }
// The newest release, if this user hasn't seen it yet (and it came out after they signed up).
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    try {
        const [
            { data: latest, error: releaseError },
            { data: settings, error: settingsError },
            { data: profile, error: profileError },
        ] = await Promise.all([
            supabase.from("releases").select("id, title, body, pr_number, released_at").order("id", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("user_settings").select("last_seen_release_id").eq("user_id", userId).maybeSingle(),
            supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
        ])
        if (releaseError) throw releaseError
        if (settingsError) throw settingsError
        if (profileError) throw profileError

        const release: Release | null = latest ? {
            id: latest.id,
            title: latest.title,
            body: cleanReleaseNotes(latest.body),
            prNumber: latest.pr_number,
            releasedAt: latest.released_at,
        } : null

        const show = shouldShowRelease(release, settings?.last_seen_release_id ?? null, profile?.created_at ?? null)
        return NextResponse.json({ release: show ? release : null })
    } catch (error) {
        console.log("Error loading the latest release: ", error)
        return NextResponse.json({ message: "Error loading the latest release" }, { status: 500 })
    }
}

// POST /api/releases  { seenId }
// Marks a release (and every older one) as seen, so its popup isn't shown again. Never moves backwards.
export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const seenId = body?.seenId
    if (!Number.isSafeInteger(seenId) || seenId < 1) {
        return NextResponse.json({ message: "seenId must be a release id" }, { status: 400 })
    }

    try {
        // make sure the settings row exists, without changing it if it does
        const { error: rowError } = await supabase
            .from("user_settings")
            .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
        if (rowError) throw rowError

        // Only ever moves forwards, decided by the database in one statement: if two tabs dismiss
        // different releases at once, whichever finishes last can't put back the older one
        const { error } = await supabase
            .from("user_settings")
            .update({ last_seen_release_id: seenId, updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .or(`last_seen_release_id.is.null,last_seen_release_id.lt.${seenId}`)
        if (error) {
            if (error.code === "23503") {
                return NextResponse.json({ message: "No such release" }, { status: 400 })
            }
            throw error
        }
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.log("Error saving the seen release: ", error)
        return NextResponse.json({ message: "Error saving the seen release" }, { status: 500 })
    }
}
