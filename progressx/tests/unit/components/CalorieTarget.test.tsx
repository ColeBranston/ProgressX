// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import CalorieTarget, { meterLabels, meterPosition } from "@/app/internal_components/mydiet/CalorieTarget"

const band = () => {
    const style = screen.getByTestId("calorie-target-band").style
    return { bottom: parseFloat(style.getPropertyValue("--offset")), height: parseFloat(style.getPropertyValue("--height")) }
}

describe("CalorieTarget", () => {
    it("labels the boxes from maintenance - 1000 to + 1000, in steps of 200", () => {
        expect(meterLabels(2574)).toEqual([3574, 3374, 3174, 2974, 2774, 2574, 2374, 2174, 1974, 1774, 1574])
    })

    it("puts each label's value in the middle of its box", () => {
        expect(meterPosition(1574, 2574)).toBeCloseTo(0.5 / 11)
        expect(meterPosition(2574, 2574)).toBeCloseTo(5.5 / 11)
        expect(meterPosition(2874, 2574)).toBeCloseTo(7 / 11) // halfway between the 2774 and 2974 labels
        expect(meterPosition(0, 2574)).toBe(0)
        expect(meterPosition(9000, 2574)).toBe(1)
    })

    it("centres the highlight on the goal's target, the same size for every goal", () => {
        const heights = (["Deficit", "Maintain", "Surplus"] as const).map((goal) => {
            const { unmount } = render(<CalorieTarget totalExpenditure={2574} goal={goal} />)
            const { bottom, height } = band()
            const target = { Deficit: 2074, Maintain: 2574, Surplus: 2824 }[goal]
            expect((bottom + height / 2) / 100).toBeCloseTo(meterPosition(target, 2574))
            unmount()
            return height
        })
        expect(new Set(heights.map((h) => h.toFixed(6))).size).toBe(1)
    })

    it("turns green once the intake is within 100 kCal of the target", () => {
        const { rerender } = render(<CalorieTarget totalExpenditure={2574} goal="Surplus" curr={2600} />)
        expect(screen.getByTestId("calorie-target-band").style.getPropertyValue("--background")).not.toContain("0, 255, 0")
        rerender(<CalorieTarget totalExpenditure={2574} goal="Surplus" curr={2800} />)
        expect(screen.getByTestId("calorie-target-band").style.getPropertyValue("--background")).toContain("0, 255, 0")
    })
})
