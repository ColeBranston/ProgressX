import { describe, expect, it } from "vitest"
import { cleanReleaseNotes, parseInline, parseReleaseNotes, shouldShowRelease } from "@/app/internal_components/releases/releases"

describe("cleanReleaseNotes", () => {
    it("drops CodeRabbit's summary, HTML comments, tags and tool attribution", () => {
        const body = [
            "Adds an **Activity level** picker.",
            "<!-- reviewer note -->",
            "",
            "<!-- This is an auto-generated comment: release notes by coderabbit.ai -->",
            "## Summary by CodeRabbit",
            "* New Features",
            "<!-- end of auto-generated comment: release notes by coderabbit.ai -->",
            "<details><summary>More</summary>Hidden bits</details>",
            "",
            "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
            "Co-Authored-By: Someone <a@b.c>",
        ].join("\r\n")
        expect(cleanReleaseNotes(body)).toBe("Adds an **Activity level** picker.\n\nMoreHidden bits")
    })

    it("drops an unclosed comment to the end", () => {
        expect(cleanReleaseNotes("Visible\n<!-- never closed\nhidden")).toBe("Visible")
    })

    it("treats a missing description as empty", () => {
        expect(cleanReleaseNotes(null)).toBe("")
    })
})

describe("parseReleaseNotes", () => {
    it("reads headings, lists and paragraphs", () => {
        const blocks = parseReleaseNotes("## What's new\nYou can now\nchange your activity level.\n\n- Faster **search**\n  that wraps\n1. Use `kg`")
        expect(blocks).toEqual([
            { kind: "heading", inlines: [{ text: "What's new" }] },
            { kind: "paragraph", inlines: [{ text: "You can now change your activity level." }] },
            { kind: "list", items: [
                [{ text: "Faster " }, { text: "search", bold: true }, { text: " " }, { text: "that wraps" }],
                [{ text: "Use " }, { text: "kg", code: true }],
            ] },
        ])
    })

    it("keeps only the text of links and images", () => {
        expect(parseInline("See [the docs](https://evil.example) ![pic](x.png)")).toEqual([{ text: "See the docs pic" }])
    })
})

describe("shouldShowRelease", () => {
    const release = { id: 5, releasedAt: "2026-10-13T12:00:00Z" }

    it("shows a release the user hasn't seen", () => {
        expect(shouldShowRelease(release, null, "2026-01-01T00:00:00")).toBe(true)
        expect(shouldShowRelease(release, 4, null)).toBe(true)
    })

    it("hides a release once it or a newer one was seen", () => {
        expect(shouldShowRelease(release, 5, null)).toBe(false)
        expect(shouldShowRelease(release, 6, null)).toBe(false)
    })

    it("hides releases from before the account was made (created_at is UTC without a zone)", () => {
        expect(shouldShowRelease(release, null, "2026-10-13T12:30:00")).toBe(false)
        expect(shouldShowRelease(release, null, "2026-10-13T11:30:00")).toBe(true)
    })

    it("shows nothing when there are no releases", () => {
        expect(shouldShowRelease(null, null, null)).toBe(false)
    })
})
