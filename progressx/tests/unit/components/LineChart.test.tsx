// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LineChart } from "@/app/internal_components/mystats/charts"

beforeEach(() => {
    // jsdom has no layout: give the chart a width so it draws, and a no-op ResizeObserver
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800)
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
})

const gapLabel = (missing: number) => missing === 1 ? "No data" : `No data · ${missing} days`
const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

describe("LineChart gaps", () => {
    it("bridges days with no value and labels how many were missed", () => {
        const { container } = render(<LineChart labels={labels} series={[{ name: "Score", tone: "primary", values: [50, null, 60, null, null, null, 70] }]} format={String} ariaLabel="Score" gapLabel={gapLabel} />)
        expect(screen.getByText("No data")).toBeInTheDocument()
        expect(screen.getByText("No data · 3 days")).toBeInTheDocument()
        expect(container.querySelectorAll("line[class*=gapLine]")).toHaveLength(2)
    })

    it("doesn't bridge before the first or after the last value", () => {
        const { container } = render(<LineChart labels={labels} series={[{ name: "Score", tone: "primary", values: [null, 50, 60, null, null, null, null] }]} format={String} ariaLabel="Score" gapLabel={gapLabel} />)
        expect(screen.queryByText(/No data/)).toBeNull()
        expect(container.querySelectorAll("line[class*=gapLine]")).toHaveLength(0)
    })

    it("still leaves holes without gapLabel", () => {
        const { container } = render(<LineChart labels={labels} series={[{ name: "Score", tone: "primary", values: [50, null, 60, null, null, null, 70] }]} format={String} ariaLabel="Score" />)
        expect(container.querySelectorAll("line[class*=gapLine]")).toHaveLength(0)
        expect(container.querySelector("path")?.getAttribute("d")?.match(/M/g)).toHaveLength(3)
    })
})
