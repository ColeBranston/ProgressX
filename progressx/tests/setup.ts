import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"

// React Testing Library only cleans up automatically when test globals are on
afterEach(async () => {
    if (typeof document !== "undefined") {
        const { cleanup } = await import("@testing-library/react")
        cleanup()
    }
})
