import type { MetadataRoute } from "next";
import { SITE_URL } from "./siteUrl";
import { supabase } from "./supabaseClient/client";

// Built per request (cached for an hour), not at build time: the build has no database credentials
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const MAX_PROFILES = 5000

// /sitemap.xml: the public pages, and every public profile, at their one canonical https address
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const pages: MetadataRoute.Sitemap = [
        { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
        { url: `${SITE_URL}/explore`, changeFrequency: "daily", priority: 0.9 },
        { url: `${SITE_URL}/research`, changeFrequency: "weekly", priority: 0.7 },
        { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.5 },
        { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
        { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    ]
    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("display_username")
            .eq("profile_privacy", "public")
            .eq("isOnboarded", true)
            .not("display_username", "is", null)
            .order("followers_count", { ascending: false })
            .limit(MAX_PROFILES)
        if (error) throw error
        for (const row of data ?? []) {
            pages.push({ url: `${SITE_URL}/profile/${encodeURIComponent(row.display_username as string)}`, changeFrequency: "weekly", priority: 0.6 })
        }
    } catch (e) {
        // the public pages are still worth listing if the database can't be reached
        console.log("Couldn't list public profiles for the sitemap: ", e instanceof Error ? e.message : e)
    }
    return pages
}
