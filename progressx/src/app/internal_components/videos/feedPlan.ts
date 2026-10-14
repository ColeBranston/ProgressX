import type { VideoCard } from "./videoTypes";

// How the video feed is paced: which videos are kept loaded, when more are fetched, which video comes
// next, and where ads go. Plain functions, shared by the feed component and the feed API.

// At most 10 videos are loaded at once: the current one, the 5 after it (so the next swipes are
// instant) and the 4 before it (so going back is too). Videos further back are unloaded; their details
// stay in memory, so scrolling back loads them again.
export const LOADED_AHEAD = 5
export const LOADED_BEHIND = 4

export function loadedRange(index: number, length: number): [number, number] {
    return [Math.max(0, index - LOADED_BEHIND), Math.min(length - 1, index + LOADED_AHEAD)]
}

// Fetch more once fewer than 5 items are queued after the current one
export function needsMore(index: number, length: number): boolean {
    return length - 1 - index < LOADED_AHEAD
}

// ---------- random picking (no ranking yet) ----------

export const FEED_BATCH = 5

// Up to `count` ids picked at random from `pool`. Ids the viewer hasn't been shown (`recent`, newest
// first) come first; once those run out, ones shown longest ago are reused, but never the ones still
// loaded around them, unless that's all there is.
export function pickRandom(pool: string[], recent: string[], count: number, random: () => number = Math.random): string[] {
    const seen = new Set(recent)
    const shuffle = (ids: string[]) => {
        const out = [...ids]
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1))
            ;[out[i], out[j]] = [out[j], out[i]]
        }
        return out
    }
    const picked = shuffle(pool.filter((id) => !seen.has(id))).slice(0, count)
    if (picked.length < count) {
        const inPool = new Set(pool)
        const loaded = new Set(recent.slice(0, LOADED_AHEAD + LOADED_BEHIND + 1))
        // longest ago first
        const reusable = [...recent].reverse().filter((id) => inPool.has(id) && !loaded.has(id))
        const fallback = reusable.length ? reusable : [...recent].reverse().filter((id) => inPool.has(id))
        for (const id of fallback) {
            if (picked.length >= count) break
            if (!picked.includes(id)) picked.push(id)
        }
    }
    return picked
}

// ---------- ads ----------

// Set by the server from its environment (see api/libs/ads.ts); null when ads are off
export type AdConfig = {
    tagUrl: string,         // a VAST / VMAP video ad tag (Google Ad Manager or AdSense for video)
    firstAfter: number,     // organic videos before the first ad
    every: number,          // organic videos between ads after that
    minGapSeconds: number,  // never two ads closer together than this
}

export type FeedItem =
    | { kind: "video", key: string, video: VideoCard }
    | { kind: "ad", key: string }

// Appends videos to the feed, putting an ad slot in wherever the pacing calls for one. Ads go between
// videos (never first), after `firstAfter` videos and then every `every` videos.
export function appendWithAds(items: FeedItem[], videos: VideoCard[], ads: AdConfig | null, nextKey: () => string): FeedItem[] {
    const out = [...items]
    let sinceAd = organicSinceLastAd(out)
    const adsSoFar = out.some((item) => item.kind === "ad")
    let needed = adsSoFar ? ads?.every : ads?.firstAfter
    for (const video of videos) {
        if (ads && needed !== undefined && sinceAd >= needed) {
            out.push({ kind: "ad", key: nextKey() })
            sinceAd = 0
            needed = ads.every
        }
        out.push({ kind: "video", key: nextKey(), video })
        sinceAd++
    }
    return out
}

function organicSinceLastAd(items: FeedItem[]): number {
    let count = 0
    for (let i = items.length - 1; i >= 0 && items[i].kind === "video"; i--) count++
    return count
}

// An ad slot reached sooner than minGapSeconds after the last ad was shown is skipped
export function adAllowedNow(ads: AdConfig, lastAdShownAt: number | null, now = Date.now()): boolean {
    return lastAdShownAt === null || now - lastAdShownAt >= ads.minGapSeconds * 1000
}
