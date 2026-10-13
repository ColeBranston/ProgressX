// Release notes come from the merged pull request's title and description (recorded by CI after each
// deploy, see ci/record-release.py). Descriptions are GitHub markdown written for developers, so they
// are tidied up and shown as a small, safe subset of markdown: never as HTML.

export type Release = {
    id: number,
    title: string,
    body: string,
    prNumber: number | null,
    releasedAt: string,
}

export const RELEASE_TITLE_MAX = 300
export const RELEASE_BODY_MAX = 20_000

// Bits of a PR description that are for developers, not users: CodeRabbit's generated summary, HTML
// comments, raw HTML tags and tool attribution lines
export function cleanReleaseNotes(body: string | null | undefined): string {
    return (body ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/<!--\s*This is an auto-generated comment: release notes by coderabbit\.ai\s*-->[\s\S]*?<!--\s*end of auto-generated comment: release notes by coderabbit\.ai\s*-->/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<\/?[a-z][^>]*>/gi, "")
        .replace(/^.*Generated with \[Claude Code\].*$/gim, "")
        .replace(/^Co-Authored-By:.*$/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, RELEASE_BODY_MAX)
}

export type Inline = { text: string, bold?: boolean, code?: boolean }
export type Block =
    | { kind: "heading", inlines: Inline[] }
    | { kind: "paragraph", inlines: Inline[] }
    | { kind: "list", items: Inline[][] }

// **bold** and `code`; links keep only their text ([text](url) -> text), so notes never link anywhere
export function parseInline(text: string): Inline[] {
    const plain = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    const inlines: Inline[] = []
    const pattern = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g
    let last = 0
    for (const match of plain.matchAll(pattern)) {
        if (match.index > last) inlines.push({ text: plain.slice(last, match.index) })
        if (match[3] !== undefined) inlines.push({ text: match[3], code: true })
        else inlines.push({ text: match[1] ?? match[2], bold: true })
        last = match.index + match[0].length
    }
    if (last < plain.length) inlines.push({ text: plain.slice(last) })
    return inlines
}

// Headings, bullet or numbered lists and paragraphs; anything else is shown as plain text
export function parseReleaseNotes(body: string): Block[] {
    const blocks: Block[] = []
    let paragraph: string[] = []
    let list: Inline[][] | null = null

    const flush = () => {
        if (paragraph.length) blocks.push({ kind: "paragraph", inlines: parseInline(paragraph.join(" ")) })
        if (list) blocks.push({ kind: "list", items: list })
        paragraph = []
        list = null
    }

    for (const raw of body.split("\n")) {
        const line = raw.trim()
        const heading = line.match(/^#{1,6}\s+(.*)$/)
        const item = line.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/)

        if (!line || /^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flush()
        } else if (heading) {
            flush()
            blocks.push({ kind: "heading", inlines: parseInline(heading[1]) })
        } else if (item) {
            if (paragraph.length) flush()
            list = list ?? []
            list.push(parseInline(item[1]))
        } else if (list && /^\s{2,}/.test(raw)) {
            // a wrapped line of the list item above
            list[list.length - 1].push({ text: " " }, ...parseInline(line))
        } else {
            if (list) flush()
            paragraph.push(line.replace(/^>\s?/, ""))
        }
    }
    flush()
    return blocks
}

// Show the newest release once: not if it came out before the account was made, and not once seen
export function shouldShowRelease(release: { id: number, releasedAt: string } | null, lastSeenId: number | null, accountCreatedAt: string | null): boolean {
    if (!release) return false
    if (lastSeenId !== null && lastSeenId >= release.id) return false
    if (accountCreatedAt) {
        // profiles.created_at has no time zone and is stored in UTC
        const created = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(accountCreatedAt) ? accountCreatedAt : `${accountCreatedAt}Z`)
        if (Number.isFinite(created) && Date.parse(release.releasedAt) < created) return false
    }
    return true
}
