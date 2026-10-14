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

const CODERABBIT_START = "<!-- This is an auto-generated comment: release notes by coderabbit.ai -->"
const CODERABBIT_END = "<!-- end of auto-generated comment: release notes by coderabbit.ai -->"

// Removes every `start`...`end` span (an unclosed one runs to the end). Plain string search, so a crafted
// description can't make it slow.
function removeBetween(text: string, start: string, end: string): string {
    let out = ""
    let from = 0
    for (let at = text.indexOf(start); at !== -1; at = text.indexOf(start, from)) {
        out += text.slice(from, at)
        const close = text.indexOf(end, at + start.length)
        from = close === -1 ? text.length : close + end.length
    }
    return out + text.slice(from)
}

// Lines that credit the tools used to write the PR, not the change itself
const isAttribution = (line: string) => line.includes("Generated with [Claude Code]") || /^co-authored-by:/i.test(line.trim())

// Bits of a PR description that are for developers, not users: CodeRabbit's generated summary, HTML
// comments, raw HTML tags and tool attribution lines
export function cleanReleaseNotes(body: string | null | undefined): string {
    let text = (body ?? "").replace(/\r\n?/g, "\n")
    text = removeBetween(text, CODERABBIT_START, CODERABBIT_END)
    text = removeBetween(text, "<!--", "-->")
    return text
        .replace(/<\/?[a-z][^<>]*>/gi, "")
        .split("\n")
        .filter((line) => !isAttribution(line))
        .join("\n")
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

// "## Title" -> "Title"; null when the line isn't a heading
function headingText(line: string): string | null {
    const marker = /^#{1,6}\s/.exec(line)
    return marker ? line.slice(marker[0].length).trim() : null
}

// "- item", "* item", "1. item" or "2) item" (with an optional "[ ]" / "[x]" checkbox) -> "item"
function listItemText(line: string): string | null {
    const marker = /^(?:[-*+]|\d{1,9}[.)])\s/.exec(line)
    if (!marker) return null
    const item = line.slice(marker[0].length).trim()
    const checkbox = /^\[[ xX]\]\s/.exec(item)
    return checkbox ? item.slice(checkbox[0].length).trim() : item
}

const isBreak = (line: string) => !line || /^(?:-{3,}|\*{3,}|_{3,})$/.test(line)

// Headings, bullet or numbered lists and paragraphs; anything else is shown as plain text
export function parseReleaseNotes(body: string): Block[] {
    const blocks: Block[] = []
    let paragraph: string[] = []
    let list: Inline[][] = []

    const flush = () => {
        if (paragraph.length) blocks.push({ kind: "paragraph", inlines: parseInline(paragraph.join(" ")) })
        if (list.length) blocks.push({ kind: "list", items: list })
        paragraph = []
        list = []
    }

    for (const raw of body.split("\n")) {
        const line = raw.trim()
        const heading = headingText(line)
        const item = listItemText(line)

        if (isBreak(line)) {
            flush()
        } else if (heading !== null) {
            flush()
            blocks.push({ kind: "heading", inlines: parseInline(heading) })
        } else if (item !== null) {
            if (paragraph.length) flush()
            list.push(parseInline(item))
        } else if (list.length && raw.startsWith("  ")) {
            // a wrapped line of the list item above
            list[list.length - 1].push({ text: " " }, ...parseInline(line))
        } else {
            if (list.length) flush()
            paragraph.push(line.startsWith(">") ? line.slice(1).trim() : line)
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
        const created = Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(accountCreatedAt) ? accountCreatedAt : `${accountCreatedAt}Z`)
        if (Number.isFinite(created) && Date.parse(release.releasedAt) < created) return false
    }
    return true
}
