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
    personalized: boolean,  // this viewer opted in to personalized ads (Settings)
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

// ---------- contextual targeting ----------

// Fitness topics an ad slot is sold against, worked out from the captions of the videos just before it
// (public content, nothing about the viewer). Health topics such as weight loss are left out on purpose:
// ads mustn't be matched to health conditions.
const TOPIC_WORDS: Record<string, string[]> = {
    strength: ["strength", "lift", "lifting", "squat", "squats", "deadlift", "deadlifts", "bench", "powerlifting", "pr"],
    bodybuilding: ["bodybuilding", "hypertrophy", "physique", "pump", "bulk", "bulking", "gains"],
    running: ["run", "running", "runner", "marathon", "5k", "10k", "sprint", "sprints", "jog"],
    cycling: ["bike", "cycling", "cyclist", "ride", "spin"],
    yoga: ["yoga", "stretch", "stretching", "mobility", "flexibility", "pilates"],
    calisthenics: ["calisthenics", "pullup", "pullups", "pushup", "pushups", "handstand", "dips"],
    hiit: ["hiit", "crossfit", "wod", "circuit", "cardio"],
    nutrition: ["protein", "meal", "meals", "recipe", "macros", "nutrition", "preworkout"],
}
const WORD_TO_TOPIC = new Map(Object.entries(TOPIC_WORDS).flatMap(([topic, words]) => words.map((word) => [word, topic] as const)))
export const MAX_AD_TOPICS = 3

export function adTopics(captions: string[]): string[] {
    const counts = new Map<string, number>()
    for (const caption of captions) {
        const words = new Set(caption.toLowerCase().replace(/[-#]/g, "").split(/[^a-z0-9]+/))
        const topics = new Set([...words].flatMap((word) => WORD_TO_TOPIC.get(word) ?? []))
        for (const topic of topics) counts.set(topic, (counts.get(topic) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_AD_TOPICS).map(([topic]) => topic)
}

// The captions of the few videos right before position `at` (what the viewer was just watching)
export function captionsBefore(items: FeedItem[], at: number, count = 3): string[] {
    return items.slice(Math.max(0, at - count), at).flatMap((item) => item.kind === "video" ? [item.video.caption] : [])
}
