import { describe, expect, it } from "vitest"
import { AdConfig, FeedItem, adAllowedNow, appendWithAds, loadedRange, needsMore, pickRandom } from "@/app/internal_components/videos/feedPlan"
import type { VideoCard } from "@/app/internal_components/videos/videoTypes"
import { adConfig, adsTxt } from "@/app/api/libs/ads"
import { adTagFor } from "@/app/internal_components/videos/ima"

const video = (id: string) => ({ id }) as VideoCard
const ads: AdConfig = { tagUrl: "https://ads.example/tag", firstAfter: 4, every: 6, minGapSeconds: 45 }
const keys = () => { let n = 0; return () => `k${n++}` }
const kinds = (items: FeedItem[]) => items.map((item) => item.kind === "ad" ? "AD" : item.video.id).join(" ")

describe("loaded window", () => {
    it("keeps the current item, 5 ahead and 4 behind: 10 at most", () => {
        expect(loadedRange(0, 30)).toEqual([0, 5])
        expect(loadedRange(10, 30)).toEqual([6, 15])
        expect(loadedRange(28, 30)).toEqual([24, 29])
        const [ first, last ] = loadedRange(10, 30)
        expect(last - first + 1).toBe(10)
    })

    it("asks for more once fewer than 5 are queued ahead", () => {
        expect(needsMore(0, 6)).toBe(false) // 5 ahead
        expect(needsMore(1, 6)).toBe(true)  // 4 ahead
        expect(needsMore(0, 0)).toBe(true)
    })
})

describe("pickRandom", () => {
    const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

    it("picks unseen videos first, at random", () => {
        const pool = ["a", "b", "c", "d", "e", "f", "g", "h"]
        const picked = pickRandom(pool, ["a", "b", "c"], 5, seeded(7))
        expect(picked).toHaveLength(5)
        expect(new Set(picked)).toEqual(new Set(["d", "e", "f", "g", "h"]))
        expect(pickRandom(pool, [], 5, seeded(1))).not.toEqual(pickRandom(pool, [], 5, seeded(2)))
    })

    it("reuses the videos shown longest ago once everything's been seen, never the ones still loaded", () => {
        const pool = Array.from({ length: 14 }, (_, i) => `v${i}`)
        const recent = [...pool].reverse() // v13 shown most recently ... v0 longest ago
        expect(pickRandom(pool, recent, 3)).toEqual(["v0", "v1", "v2"])
        // the 10 most recent (v13..v4) are still loaded around the viewer
        expect(pickRandom(pool, recent, 6)).toEqual(["v0", "v1", "v2", "v3"])
    })

    it("repeats loaded ones only when that's all there is", () => {
        expect(pickRandom(["a", "b"], ["a", "b"], 5)).toEqual(["b", "a"])
        expect(pickRandom([], ["a"], 5)).toEqual([])
    })
})

describe("ad placement", () => {
    it("puts the first ad after 4 videos, then one every 6, never first", () => {
        const items = appendWithAds([], "abcdefghijklmnop".split("").map(video), ads, keys())
        expect(kinds(items)).toBe("a b c d AD e f g h i j AD k l m n o p")
    })

    it("keeps the pacing across batches", () => {
        const next = keys()
        let items = appendWithAds([], ["a", "b", "c"].map(video), ads, next)
        items = appendWithAds(items, ["d", "e", "f"].map(video), ads, next)
        items = appendWithAds(items, ["g", "h", "i", "j", "k", "l"].map(video), ads, next)
        expect(kinds(items)).toBe("a b c d AD e f g h i j AD k l")
        expect(new Set(items.map((item) => item.key)).size).toBe(items.length)
    })

    it("adds no ads when they're off", () => {
        expect(kinds(appendWithAds([], "abcdefghij".split("").map(video), null, keys()))).toBe("a b c d e f g h i j")
    })

    it("spaces ads at least minGapSeconds apart", () => {
        expect(adAllowedNow(ads, null)).toBe(true)
        expect(adAllowedNow(ads, 1_000_000, 1_000_000 + 44_000)).toBe(false)
        expect(adAllowedNow(ads, 1_000_000, 1_000_000 + 45_000)).toBe(true)
    })
})

describe("ad settings from the environment", () => {
    it("is off without an https ad tag", () => {
        expect(adConfig({})).toBeNull()
        expect(adConfig({ AD_VIDEO_TAG_URL: "http://ads.example/tag" })).toBeNull()
        expect(adConfig({ AD_VIDEO_TAG_URL: "not a url" })).toBeNull()
    })

    it("uses the defaults, or valid overrides", () => {
        expect(adConfig({ AD_VIDEO_TAG_URL: "https://ads.example/tag" })).toEqual(ads)
        expect(adConfig({ AD_VIDEO_TAG_URL: "https://ads.example/tag", AD_FIRST_AFTER: "3", AD_EVERY: "8", AD_MIN_GAP_SECONDS: "60" }))
            .toEqual({ tagUrl: "https://ads.example/tag", firstAfter: 3, every: 8, minGapSeconds: 60 })
        expect(adConfig({ AD_VIDEO_TAG_URL: "https://ads.example/tag", AD_EVERY: "1", AD_FIRST_AFTER: "abc" })).toEqual(ads)
    })

    it("serves ads.txt lines when set", () => {
        expect(adsTxt({})).toBeNull()
        expect(adsTxt({ ADS_TXT: "google.com, pub-123, DIRECT, f08c47fec0942fa0\\nother.com, 9, RESELLER" }))
            .toBe("google.com, pub-123, DIRECT, f08c47fec0942fa0\nother.com, 9, RESELLER\n")
    })

    it("asks for non-personalized ads with a fresh correlator and the page", () => {
        const tag = new URL(adTagFor("https://pubads.g.doubleclick.net/gampad/ads?iu=/1/feed&npa=0", "https://progressx.ca/", 42))
        expect(tag.searchParams.get("npa")).toBe("1")
        expect(tag.searchParams.get("correlator")).toBe("42")
        expect(tag.searchParams.get("description_url")).toBe("https://progressx.ca/")
        expect(tag.searchParams.get("iu")).toBe("/1/feed")
    })
})
