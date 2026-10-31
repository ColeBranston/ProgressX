// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BarChart, ChartCard, compactNumber, Heatmap, LegendItem, LineChart, StatTile } from "@/app/internal_components/mystats/charts"
import { stubLayout } from "./workoutFixtures"

beforeEach(() => stubLayout())

describe("ChartCard", () => {
    const table = { columns: ["Week", "Sets"], rows: [["Oct 1", 3], ["Oct 8", 5]] }

    it("switches between the chart and a table of the same data", async () => {
        render(<ChartCard title="Sets" subtitle="Per week" table={table} legend={<LegendItem label="Sets" kind="bar" />}><p>the chart</p></ChartCard>)
        expect(screen.getByRole("heading", { name: "Sets" })).toBeInTheDocument()
        expect(screen.getByText("Per week")).toBeInTheDocument()
        expect(screen.getByText("the chart")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Chart" })).toHaveAttribute("aria-pressed", "true")

        await userEvent.click(screen.getByRole("button", { name: "Table" }))
        expect(screen.queryByText("the chart")).toBeNull()
        expect(screen.getByRole("rowheader", { name: "Oct 8" })).toBeInTheDocument()
        expect(screen.getByRole("cell", { name: "5" })).toBeInTheDocument()
        expect(screen.getByRole("columnheader", { name: "Sets" })).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Chart" }))
        expect(screen.getByText("the chart")).toBeInTheDocument()
    })

    it("has no toggle without a table", () => {
        render(<ChartCard title="Plain"><p>only a chart</p></ChartCard>)
        expect(screen.queryByRole("group", { name: "Plain view" })).toBeNull()
    })
})

describe("BarChart", () => {
    const data = [
        { key: "a", label: "Mon", value: 3, detail: "over 2 sessions" },
        { key: "b", label: "Tue", value: null },
        { key: "c", label: "Wed", value: 12, highlight: true },
    ]

    it("labels each bar for screen readers, including days with no data", () => {
        render(<BarChart data={data} format={(v) => `${v} sets`} ariaLabel="Sets per day" />)
        expect(screen.getByRole("img", { name: "Sets per day" })).toBeInTheDocument()
        expect(screen.getByLabelText("Mon: 3 sets")).toBeInTheDocument()
        expect(screen.getByLabelText("Tue: no data")).toBeInTheDocument()
        expect(screen.getByText("12 sets")).toBeInTheDocument() // the highlighted bar prints its value
    })

    it("shows a tooltip on focus or hover and hides it again", () => {
        render(<BarChart data={data} format={(v) => `${v} sets`} valueLabel="per day" ariaLabel="Sets per day" />)
        fireEvent.focus(screen.getByLabelText("Mon: 3 sets"))
        const tip = screen.getByRole("status")
        expect(within(tip).getByText("Mon")).toBeInTheDocument()
        expect(within(tip).getByText("3 sets")).toBeInTheDocument()
        expect(within(tip).getByText("per day")).toBeInTheDocument()
        expect(within(tip).getByText("over 2 sessions")).toBeInTheDocument()

        fireEvent.blur(screen.getByLabelText("Mon: 3 sets"))
        expect(screen.queryByRole("status")).toBeNull()

        fireEvent.pointerEnter(screen.getByLabelText("Tue: no data"))
        expect(within(screen.getByRole("status")).getByText("No data")).toBeInTheDocument()
        fireEvent.pointerLeave(screen.getByRole("img", { name: "Sets per day" }).parentElement!)
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("draws a labelled target line", () => {
        render(<BarChart data={data} format={String} ariaLabel="Calories" target={{ value: 10, label: "Goal 10" }} />)
        expect(screen.getByText("Goal 10")).toBeInTheDocument()
    })

    it("draws nothing until it knows its width", () => {
        stubLayout({ width: 0 })
        render(<BarChart data={data} format={String} ariaLabel="Calories" />)
        expect(screen.queryByRole("img")).toBeNull()
    })
})

describe("LineChart", () => {
    const labels = ["W1", "W2", "W3", "W4"]
    const series = [
        { name: "Best", tone: "primary" as const, values: [100, 105, null, 110] },
        { name: "Top", tone: "muted" as const, values: [90, null, 95, 100] },
    ]

    it("steps through points with the arrow keys and shows every series in the tooltip", async () => {
        render(<LineChart labels={labels} series={series} format={(v) => `${v} kg`} ariaLabel="Strength" />)
        const chart = screen.getByRole("img", { name: "Strength" })
        expect(screen.getByText("110 kg")).toBeInTheDocument() // last value is labelled

        chart.focus()
        await userEvent.keyboard("{ArrowRight}")
        let tip = screen.getByRole("status")
        expect(within(tip).getByText("W1")).toBeInTheDocument()
        expect(within(tip).getByText("100 kg")).toBeInTheDocument()
        expect(within(tip).getByText("90 kg")).toBeInTheDocument()

        await userEvent.keyboard("{ArrowRight}")
        tip = screen.getByRole("status")
        expect(within(tip).getByText("W2")).toBeInTheDocument()
        expect(within(tip).getByText("No data")).toBeInTheDocument()

        await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}")
        expect(within(screen.getByRole("status")).getByText("W1")).toBeInTheDocument()

        await userEvent.keyboard("a") // other keys do nothing
        expect(within(screen.getByRole("status")).getByText("W1")).toBeInTheDocument()

        fireEvent.blur(chart)
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("starts from the end with ArrowLeft", async () => {
        render(<LineChart labels={labels} series={series} format={(v) => `${v} kg`} ariaLabel="Strength" />)
        screen.getByRole("img", { name: "Strength" }).focus()
        await userEvent.keyboard("{ArrowLeft}")
        expect(within(screen.getByRole("status")).getByText("W4")).toBeInTheDocument()
    })

    it("picks the nearest point under the pointer", () => {
        const { container } = render(<LineChart labels={labels} series={series} format={(v) => `${v} kg`} ariaLabel="Strength" />)
        const hit = container.querySelector("rect")!
        vi.spyOn(hit, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
        fireEvent.pointerMove(hit, { clientX: 205 })
        expect(within(screen.getByRole("status")).getByText("W3")).toBeInTheDocument()
        fireEvent.pointerLeave(hit)
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("zooms the axis to the data and joins gaps when asked", () => {
        const { container } = render(
            <LineChart
                labels={labels}
                series={[{ name: "Weight", tone: "primary", values: [80.2, null, 80.6, 80.4] }]}
                format={(v) => `${v} kg`}
                tickFormat={(v) => `${v}kg`}
                zoom={{ minSpan: 2 }}
                connectGaps
                target={{ value: 79, label: "Goal" }}
                ariaLabel="Weight"
            />,
        )
        const ticks = screen.getAllByText(/^\d+(\.\d+)?kg$/).map((el) => Number.parseFloat(el.textContent!))
        expect(Math.min(...ticks)).toBeGreaterThan(70) // doesn't start at zero
        expect(Math.min(...ticks)).toBeLessThanOrEqual(79)
        expect(screen.getByText("Goal")).toBeInTheDocument()
        // one unbroken line through the missing day
        const line = container.querySelector("path")!.getAttribute("d")!
        expect(line.match(/M/g)).toHaveLength(1)
        expect(line.match(/L/g)).toHaveLength(2)
    })

    it("breaks the line at gaps by default", () => {
        const { container } = render(<LineChart labels={labels} series={[series[0]]} format={String} ariaLabel="Best" />)
        expect(container.querySelector("path")!.getAttribute("d")!.match(/M/g)).toHaveLength(2)
    })

    it("centres a single point", () => {
        render(<LineChart labels={["Only"]} series={[{ name: "One", tone: "primary", values: [5] }]} format={String} ariaLabel="One" />)
        expect(screen.getAllByTestId("chart-point")).toHaveLength(1)
        expect(screen.getByText("Only")).toHaveAttribute("text-anchor", "middle")
    })
})

describe("Heatmap", () => {
    const rows = [{ key: "chest", label: "Chest" }, { key: "legs", label: "Legs" }]
    const columns = [{ key: "w1", label: "Week 1" }, { key: "w2", label: "Week 2" }]
    const cell = (row: string, column: string) => {
        if (row === "legs" && column === "w2") return { value: null, display: "Nothing" }
        if (row === "chest" && column === "w2") return { value: 1, over: true, display: "150%" }
        return { value: row === "chest" ? 0.5 : 0.1, display: "Some", details: [{ label: "Bench", value: "3" }] }
    }

    it("explains each cell in a tooltip, and flags cells over the limit", () => {
        render(<Heatmap rows={rows} columns={columns} cell={cell} ariaLabel="Sets per group" overLabel="Too much" emptyLabel="None" />)
        expect(screen.getByRole("img", { name: "Sets per group" })).toBeInTheDocument()
        expect(screen.getAllByText("!")).toHaveLength(2) // on the cell, and in the legend
        expect(screen.getByText("Too much")).toBeInTheDocument() // legend entry only shows when a cell is over
        expect(screen.getByText("None")).toBeInTheDocument()

        fireEvent.focus(screen.getByLabelText("Chest, Week 1: Some"))
        const tip = screen.getByRole("status")
        expect(within(tip).getByText("Chest · Week 1")).toBeInTheDocument()
        expect(within(tip).getByText("Bench")).toBeInTheDocument()

        fireEvent.pointerEnter(screen.getByLabelText("Chest, Week 2: 150%"))
        expect(within(screen.getByRole("status")).getByText("Too much")).toBeInTheDocument()
        fireEvent.blur(screen.getByLabelText("Chest, Week 2: 150%"))
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("leaves the over-limit legend off when nothing is over", () => {
        render(<Heatmap rows={rows} columns={columns} cell={() => ({ value: 0.9, display: "ok" })} ariaLabel="Sets" />)
        expect(screen.queryByText("Over limit")).toBeNull()
        expect(screen.getByText("100%+ of target")).toBeInTheDocument()
    })
})

describe("StatTile", () => {
    it("shows the value, unit, caption and an arrow for the change", () => {
        const { rerender } = render(<StatTile label="Top set" value="100" unit="kg" delta={{ text: "+5 kg", good: true }} caption="This week" />)
        expect(screen.getByText("Top set")).toBeInTheDocument()
        expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "100 kg")).toBeInTheDocument()
        expect(screen.getByText("▲")).toBeInTheDocument()
        expect(screen.getByText("This week")).toBeInTheDocument()

        rerender(<StatTile label="Top set" value="95" delta={{ text: "−5 kg", good: false }} />)
        expect(screen.getByText("▼")).toBeInTheDocument()

        rerender(<StatTile label="Top set" value="95" delta={{ text: "no change", good: null }} />)
        expect(screen.getByText("•")).toBeInTheDocument()
    })
})

describe("compactNumber", () => {
    it("rounds small numbers and abbreviates big ones", () => {
        expect(compactNumber(1234.6)).toBe((1235).toLocaleString())
        expect(compactNumber(25300)).toMatch(/25\.3K/i)
    })
})
