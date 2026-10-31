import { vi } from "vitest"

// Browser APIs jsdom doesn't have, for component tests

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

// IntersectionObserver that only reports when a test says an element came into view
export class FakeIntersectionObserver {
    static all: FakeIntersectionObserver[] = []
    observed = new Set<Element>()
    constructor(public callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) {
        FakeIntersectionObserver.all.push(this)
    }
    observe = vi.fn((el: Element) => { this.observed.add(el) })
    unobserve = vi.fn((el: Element) => { this.observed.delete(el) })
    disconnect = vi.fn(() => { this.observed.clear() })
    takeRecords = () => []
    root = null
    rootMargin = ""
    thresholds = []

    // tells every observer watching an element that it is (or isn't) on screen
    static show(isIntersecting = true) {
        for (const observer of [...FakeIntersectionObserver.all]) {
            const entries = [...observer.observed].map((target) => ({ target, isIntersecting }) as unknown as IntersectionObserverEntry)
            if (entries.length) observer.callback(entries, observer as unknown as IntersectionObserver)
        }
    }
}

export function stubIntersectionObserver() {
    FakeIntersectionObserver.all = []
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
}

// window.matchMedia answering `matches` for every query
export function stubMatchMedia(matches = false) {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
        matches, media: query, onchange: null,
        addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })))
}
