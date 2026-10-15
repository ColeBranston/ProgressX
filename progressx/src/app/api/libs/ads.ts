import { supabase } from "@/app/supabaseClient/client";
import type { AdConfig } from "@/app/internal_components/videos/feedPlan";

// Video ads in the feed, set up entirely from the server's environment (progressx/.env.local, from
// Vault's AppEnvLocal), so they can be switched on, paced or turned off without a new build:
//   AD_VIDEO_TAG_URL      the VAST / VMAP ad tag from Google Ad Manager (or AdSense for video). Unset = no ads.
//   AD_FIRST_AFTER        videos before the first ad (default 4)
//   AD_EVERY              videos between ads after that (default 6)
//   AD_MIN_GAP_SECONDS    never two ads closer together than this (default 45)
//   ADS_TXT               the ads.txt lines the ad network gives you, served at /ads.txt (\n between lines)
// Ads are requested as non-personalized (npa=1) unless the viewer opted in to personalized ads in
// Settings (user_settings.personalized_ads), see components/videos/ima.ts.

const DEFAULTS = { firstAfter: 4, every: 6, minGapSeconds: 45 }

function whole(raw: string | undefined, fallback: number, min: number, max: number): number {
    const value = Number(raw)
    return raw && Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

export function adConfig(env: Record<string, string | undefined> = process.env): AdConfig | null {
    const tag = env.AD_VIDEO_TAG_URL?.trim()
    if (!tag) return null
    try {
        if (new URL(tag).protocol !== "https:") throw new Error("not https")
    } catch {
        console.log("AD_VIDEO_TAG_URL isn't an https URL, so ads are off")
        return null
    }
    return {
        tagUrl: tag,
        firstAfter: whole(env.AD_FIRST_AFTER, DEFAULTS.firstAfter, 1, 50),
        every: whole(env.AD_EVERY, DEFAULTS.every, 2, 50),
        minGapSeconds: whole(env.AD_MIN_GAP_SECONDS, DEFAULTS.minGapSeconds, 0, 3600),
        personalized: false,
    }
}

// The ad settings for one viewer: personalized only if they opted in (a failed lookup means no)
export async function adConfigFor(userId: string): Promise<AdConfig | null> {
    const config = adConfig()
    if (!config) return null
    const { data, error } = await supabase.from("user_settings").select("personalized_ads").eq("user_id", userId).maybeSingle()
    if (error) console.log("Couldn't read the personalized ads choice: ", error.message)
    return { ...config, personalized: data?.personalized_ads === true }
}

export function adsTxt(env: Record<string, string | undefined> = process.env): string | null {
    const raw = env.ADS_TXT?.trim()
    return raw ? `${raw.replace(/\\n/g, "\n")}\n` : null
}
