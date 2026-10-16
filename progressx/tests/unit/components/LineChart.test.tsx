// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LineChart, missingDaysLabel } from "@/app/internal_components/mystats/charts"

beforeEach(() => {
    // jsdom has no layout: give the chart a width so it draws, and a no-op ResizeObserver
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800)
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
})

const labels = (n: number) => Array.from({ length: n }, (_, i) => `Day ${i + 1}`)
const chart = (values: (number | null)[], gapLabel?: (missing: number) => string) =>
    render(<LineChart labels={labels(values.length)} series={[{ name: "Score", tone: "primary", values }]} format={String} ariaLabel="Score" gapLabel={gapLabel} />)

describe("LineChart gaps", () => {
    it("bridges days with no value and labels how many were missed", () => {
        chart([50, null, 60, null, null, null, 70], missingDaysLabel)
        expect(screen.getByText("No data")).toBeInTheDocument()
        expect(screen.getByText("No data · 3 days")).toBeInTheDocument()
        expect(screen.getAllByTestId("chart-gap")).toHaveLength(2)
    })

    it("hides the bridges from screen readers", () => {
        chart([50, null, 60], missingDaysLabel)
        expect(screen.getByTestId("chart-gap")).toHaveAttribute("aria-hidden", "true")
    })

    it("doesn't bridge before the first or after the last value", () => {
        chart([null, 50, 60, null, null, null, null], missingDaysLabel)
        expect(screen.queryByText(/No data/)).toBeNull()
        expect(screen.queryByTestId("chart-gap")).toBeNull()
    })

    it("leaves holes without gapLabel", () => {
        chart([50, null, 60, null, null, null, 70])
        expect(screen.queryByTestId("chart-gap")).toBeNull()
        expect(screen.queryByText(/No data/)).toBeNull()
    })

    it("still draws a dot for a lone point on a long range, where dots are otherwise off", () => {
        // 60 days (> 45, so no dots by default) with a single logged day: nothing to bridge to
        chart([...Array(30).fill(null), 55, ...Array(29).fill(null)], missingDaysLabel)
        expect(screen.queryByTestId("chart-gap")).toBeNull()
        expect(screen.getAllByTestId("chart-point")).toHaveLength(1)
    })

    it("doesn't add dots to bridged points on a long range", () => {
        chart([40, ...Array(58).fill(null), 60], missingDaysLabel)
        expect(screen.getAllByTestId("chart-gap")).toHaveLength(1)
        expect(screen.queryByTestId("chart-point")).toBeNull()
    })
})
