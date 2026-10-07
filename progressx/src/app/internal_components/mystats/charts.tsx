"use client";

import { KeyboardEvent, PointerEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./charts.module.css";

// Small SVG chart kit for My Stats: bar, line and heatmap charts sized to their container, each with
// a hover / keyboard tooltip, inside a ChartCard that can switch to a plain table view.

// ---------- Helpers ----------

function useElementWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null)
    const [ width, setWidth ] = useState(0)

    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        setWidth(el.clientWidth)
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    return [ ref, width ] as const
}

// Round axis steps: 1, 2, 2.5 or 5 times a power of ten
function niceTicks(max: number, count = 4): number[] {
    if (!(max > 0)) return [0, 1]
    const rough = max / count
    const power = Math.pow(10, Math.floor(Math.log10(rough)))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? rough
    const ticks: number[] = []
    for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
    return ticks
}

// Ticks covering lo..hi that don't start at zero (for values like body weight, where the change matters)
function rangeTicks(lo: number, hi: number, count = 4): number[] {
    const span = Math.max(hi - lo, 1e-6)
    const rough = span / count
    const power = Math.pow(10, Math.floor(Math.log10(rough)))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? rough
    const ticks: number[] = []
    for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
    return ticks.length > 1 ? ticks : [ticks[0], ticks[0] + step]
}

export function compactNumber(value: number): string {
    return Math.abs(value) >= 10000
        ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)
        : Math.round(value).toLocaleString()
}

// Which x labels to print so they don't collide (always the first and the last)
function labelEvery(count: number, width: number, minGap = 44) {
    const fit = Math.max(1, Math.floor(width / minGap))
    return Math.max(1, Math.ceil(count / fit))
}

// Rounded 4px data end, square at the baseline
function barPath(x: number, y: number, width: number, height: number) {
    const r = Math.min(4, width / 2, height)
    if (height <= 0) return ""
    return `M${x} ${y + height} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + width - r} Q${x + width} ${y} ${x + width} ${y + r} V${y + height} Z`
}

type TooltipState = { x: number, y: number, title: string, rows: { label: string, value: string, swatch?: "primary" | "muted" | "target" }[] } | null

function Tooltip({ tip, containerWidth }: { tip: TooltipState, containerWidth: number }) {
    if (!tip) return null
    const flip = tip.x > containerWidth - 170
    return (
        <div className={styles.tooltip} style={{ left: tip.x, top: tip.y, transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -50%)` }} role="status">
            <p className={styles.tooltipTitle}>{tip.title}</p>
            {tip.rows.map((row) => (
                <p key={row.label} className={styles.tooltipRow}>
                    {row.swatch ? <i className={`${styles.lineKey} ${styles[`key_${row.swatch}`]}`} /> : null}
                    <strong>{row.value}</strong>
                    <span>{row.label}</span>
                </p>
            ))}
        </div>
    )
}

const MARGIN = { top: 16, right: 12, bottom: 28, left: 44 }

// ---------- Card with chart / table toggle ----------

export type TableData = { columns: string[], rows: (string | number)[][] }

type ChartCardProps = {
    title: string,
    subtitle?: string,
    table?: TableData,
    legend?: ReactNode,
    children: ReactNode,
    className?: string,
    dimmed?: boolean,
}

export function ChartCard({ title, subtitle, table, legend, children, className, dimmed }: ChartCardProps) {
    const [ view, setView ] = useState<"chart" | "table">("chart")

    return (
        <section className={`${styles.card} ${className ?? ""}`}>
            <header className={styles.cardHeader}>
                <div>
                    <h3 className={styles.cardTitle}>{title}</h3>
                    {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
                </div>
                {table ?
                    <div className={styles.viewToggle} role="group" aria-label={`${title} view`}>
                        <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
                        <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
                    </div>
                : null}
            </header>
            {legend && view === "chart" ? <div className={styles.legend}>{legend}</div> : null}
            <div className={`${styles.cardBody} ${dimmed ? styles.dimmed : ""}`}>
                {view === "table" && table ?
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
                            </thead>
                            <tbody>
                                {table.rows.map((row, i) => (
                                    <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                : children}
            </div>
        </section>
    )
}

export function LegendItem({ label, kind }: { label: string, kind: "primary" | "muted" | "target" | "bar" | "barMuted" }) {
    return (
        <span className={styles.legendItem}>
            <i className={kind === "bar" || kind === "barMuted" ? `${styles.legendSwatch} ${styles[kind]}` : `${styles.lineKey} ${styles[`key_${kind}`]}`} />
            {label}
        </span>
    )
}

// ---------- Bar chart ----------

export type BarDatum = { key: string, label: string, value: number | null, detail?: string, highlight?: boolean }

type BarChartProps = {
    data: BarDatum[],
    format: (value: number) => string,
    ariaLabel: string,
    height?: number,
    target?: { value: number, label: string },
    yMax?: number,
    valueLabel?: string, // tooltip row label, e.g. "avg / day"
}

export function BarChart({ data, format, ariaLabel, height = 190, target, yMax, valueLabel = "" }: BarChartProps) {
    const [ ref, width ] = useElementWidth<HTMLDivElement>()
    const [ tip, setTip ] = useState<TooltipState>(null)
    const [ active, setActive ] = useState<number | null>(null)

    const values = data.map((d) => d.value ?? 0)
    const max = yMax ?? Math.max(1, ...values, target?.value ?? 0) * 1.08
    const ticks = niceTicks(max)
    const top = ticks[ticks.length - 1]

    const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
    const plotH = height - MARGIN.top - MARGIN.bottom
    const band = data.length ? plotW / data.length : 0
    const barW = Math.max(4, Math.min(24, band - 2))
    const y = (v: number) => MARGIN.top + plotH - (v / top) * plotH
    const every = labelEvery(data.length, plotW)

    function show(i: number) {
        const d = data[i]
        setActive(i)
        setTip({
            x: MARGIN.left + band * i + band / 2,
            y: y(d.value ?? 0) - 6,
            title: d.label,
            rows: [
                { label: valueLabel, value: d.value === null ? "No data" : format(d.value) },
                ...(d.detail ? [{ label: "", value: d.detail }] : []),
            ],
        })
    }

    function hide() {
        setActive(null)
        setTip(null)
    }

    return (
        <div ref={ref} className={styles.chart} style={{ height }} onPointerLeave={hide}>
            {width > 0 ?
                <svg width={width} height={height} role="img" aria-label={ariaLabel}>
                    {ticks.map((tick) => (
                        <g key={tick}>
                            <line className={styles.grid} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
                            <text className={styles.axisText} x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{compactNumber(tick)}</text>
                        </g>
                    ))}
                    {data.map((d, i) => {
                        const x = MARGIN.left + band * i + (band - barW) / 2
                        const h = d.value ? Math.max(0, y(0) - y(d.value)) : 0
                        const last = data.length - 1
                        const showLabel = i === last || (i % every === 0 && last - i >= every)
                        return (
                            <g
                                key={d.key}
                                tabIndex={0}
                                className={styles.barGroup}
                                aria-label={`${d.label}: ${d.value === null ? "no data" : format(d.value)}`}
                                onPointerEnter={() => show(i)}
                                onFocus={() => show(i)}
                                onBlur={hide}
                            >
                                <rect className={styles.hit} x={MARGIN.left + band * i} y={MARGIN.top} width={band} height={plotH} />
                                <path className={`${styles.bar} ${d.highlight ? styles.barHighlight : ""} ${active === i ? styles.barActive : ""}`} d={barPath(x, y(0) - h, barW, h)} />
                                {d.value === null ?
                                    <line className={styles.noData} x1={x} x2={x + barW} y1={y(0) - 1} y2={y(0) - 1} />
                                : null}
                                {d.highlight && d.value !== null ?
                                    <text className={styles.valueText} x={x + barW / 2} y={y(d.value) - 6} textAnchor="middle">{format(d.value)}</text>
                                : null}
                                {showLabel ? <text className={styles.axisText} x={MARGIN.left + band * i + band / 2} y={height - 8} textAnchor="middle">{d.label}</text> : null}
                            </g>
                        )
                    })}
                    <line className={styles.baseline} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} />
                    {target && target.value > 0 ?
                        <g>
                            <line className={styles.target} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(target.value)} y2={y(target.value)} />
                            <text className={styles.targetText} x={MARGIN.left + 4} y={y(target.value) - 5} textAnchor="start">{target.label}</text>
                        </g>
                    : null}
                </svg>
            : null}
            <Tooltip tip={tip} containerWidth={width} />
        </div>
    )
}

// ---------- Line chart ----------

export type LineSeries = { name: string, tone: "primary" | "muted", values: (number | null)[] }

type LineChartProps = {
    labels: string[],     // x axis labels (one per point)
    series: LineSeries[],
    format: (value: number) => string,
    ariaLabel: string,
    height?: number,
    yMax?: number,
    target?: { value: number, label: string },
    // zoom the y axis to the data instead of starting at 0 (e.g. body weight); minSpan keeps small
    // wobbles from looking like big swings
    zoom?: { minSpan: number },
    tickFormat?: (value: number) => string,
    // draw the line straight across days with no value (for things that change continuously, like
    // body weight) instead of breaking it; points are still only drawn where there's a value
    connectGaps?: boolean,
}

export function LineChart({ labels, series, format, ariaLabel, height = 200, yMax, target, zoom, tickFormat = compactNumber, connectGaps = false }: LineChartProps) {
    const [ ref, width ] = useElementWidth<HTMLDivElement>()
    const [ index, setIndex ] = useState<number | null>(null)

    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
    let ticks: number[]
    if (zoom && all.length) {
        const lo = Math.min(...all, target?.value ?? Infinity)
        const hi = Math.max(...all, target?.value ?? -Infinity)
        const pad = Math.max(0, zoom.minSpan - (hi - lo)) / 2
        ticks = rangeTicks(lo - pad, hi + pad)
    } else {
        ticks = niceTicks(yMax ?? Math.max(1, ...all, target?.value ?? 0) * 1.1)
    }
    const bottom = zoom && all.length ? ticks[0] : 0
    const top = !zoom && yMax ? yMax : ticks[ticks.length - 1]

    const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
    const plotH = height - MARGIN.top - MARGIN.bottom
    const n = labels.length
    const x = (i: number) => MARGIN.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
    const y = (v: number) => MARGIN.top + plotH - ((Math.min(Math.max(v, bottom), top) - bottom) / (top - bottom || 1)) * plotH
    const every = labelEvery(n, plotW, 52)
    const showDots = n <= 45

    // Path with gaps where a value is missing
    function path(values: (number | null)[]) {
        let d = ""
        let drawing = false
        values.forEach((v, i) => {
            if (v === null) { if (!connectGaps) drawing = false; return }
            d += `${drawing ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
            drawing = true
        })
        return d
    }

    function pick(e: PointerEvent<SVGRectElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const rel = (e.clientX - rect.left) / Math.max(1, rect.width)
        setIndex(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))))
    }

    function onKey(e: KeyboardEvent<SVGSVGElement>) {
        if (e.key === "ArrowRight") setIndex((i) => Math.min(n - 1, (i ?? -1) + 1))
        else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, (i ?? n) - 1))
        else return
        e.preventDefault()
    }

    const primary = series.find((s) => s.tone === "primary")
    const lastIndex = primary ? primary.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop() : undefined

    const tip: TooltipState = index === null ? null : {
        x: x(index),
        y: MARGIN.top + plotH / 2,
        title: labels[index],
        rows: series.map((s) => ({ label: s.name, value: s.values[index] === null ? "No data" : format(s.values[index]!), swatch: s.tone })),
    }

    return (
        <div ref={ref} className={styles.chart} style={{ height }}>
            {width > 0 ?
                <svg
                    width={width}
                    height={height}
                    role="img"
                    aria-label={ariaLabel}
                    tabIndex={0}
                    className={styles.focusable}
                    onKeyDown={onKey}
                    onBlur={() => setIndex(null)}
                >
                    {ticks.filter((tick) => tick <= top && tick >= bottom).map((tick) => (
                        <g key={tick}>
                            <line className={styles.grid} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
                            <text className={styles.axisText} x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tickFormat(tick)}</text>
                        </g>
                    ))}
                    {labels.map((label, i) => (i % every === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < every) ?
                        <text key={i} className={styles.axisText} x={x(i)} y={height - 8} textAnchor={n > 1 && i === 0 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}>{label}</text>
                    : null)}
                    {target && target.value > 0 ?
                        <g>
                            <line className={styles.target} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(target.value)} y2={y(target.value)} />
                            <text className={styles.targetText} x={MARGIN.left + 4} y={y(target.value) - 5} textAnchor="start">{target.label}</text>
                        </g>
                    : null}
                    {index !== null ? <line className={styles.crosshair} x1={x(index)} x2={x(index)} y1={MARGIN.top} y2={MARGIN.top + plotH} /> : null}
                    {series.map((s) => (
                        <g key={s.name} className={s.tone === "primary" ? styles.seriesPrimary : styles.seriesMuted}>
                            <path className={styles.line} d={path(s.values)} />
                            {s.values.map((v, i) => {
                                // lone points (no neighbours) always get a dot so they don't vanish
                                const lone = v !== null && !connectGaps && (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null
                                return v !== null && (showDots || lone || i === index) ?
                                    <circle key={i} className={styles.dot} cx={x(i)} cy={y(v)} r={i === index ? 5 : 4} />
                                : null
                            })}
                        </g>
                    ))}
                    {primary && lastIndex !== undefined && index === null ?
                        <text className={styles.valueText} x={x(lastIndex)} y={y(primary.values[lastIndex]!) - 10} textAnchor={lastIndex === n - 1 ? "end" : "middle"}>{format(primary.values[lastIndex]!)}</text>
                    : null}
                    <rect className={styles.hit} x={MARGIN.left - 8} y={MARGIN.top} width={plotW + 16} height={plotH} onPointerMove={pick} onPointerLeave={() => setIndex(null)} />
                </svg>
            : null}
            <Tooltip tip={tip} containerWidth={width} />
        </div>
    )
}

// ---------- Heatmap ----------

// `details` adds extra tooltip lines under the value (e.g. what a count is made of)
export type HeatCell = { value: number | null, display: string, over?: boolean, details?: { label: string, value: string }[] }

type HeatmapProps = {
    rows: { key: string, label: string }[],
    columns: { key: string, label: string }[],
    cell: (rowKey: string, columnKey: string) => HeatCell,
    ariaLabel: string,
    overLabel?: string,
    legendLow?: string,
    legendHigh?: string,
    emptyLabel?: string,
}

const HEAT_STEPS = [0.2, 0.4, 0.6, 0.8, 1]

// value 0..1 -> one of five steps of the red ramp (dim = low, bright = high)
function heatClass(value: number) {
    const step = HEAT_STEPS.findIndex((limit) => value < limit)
    return styles[`heat${step === -1 ? 5 : step + 1}`]
}

export function Heatmap({ rows, columns, cell, ariaLabel, overLabel = "Over limit", legendLow = "0%", legendHigh = "100%+ of target", emptyLabel = "Nothing logged" }: HeatmapProps) {
    const [ ref, width ] = useElementWidth<HTMLDivElement>()
    const [ tip, setTip ] = useState<TooltipState>(null)
    const labelW = Math.min(130, Math.max(90, width * 0.28))
    const gap = 2
    const cellW = columns.length ? Math.max(8, (width - labelW - 4) / columns.length) : 0
    const cellH = 22
    const height = rows.length * (cellH + gap) + 26
    const every = labelEvery(columns.length, width - labelW, 40)
    const hasOver = rows.some((row) => columns.some((column) => cell(row.key, column.key).over))

    useEffect(() => { setTip(null) }, [rows, columns])

    return (
        <div>
            <div ref={ref} className={styles.chart} style={{ height }} onPointerLeave={() => setTip(null)}>
                {width > 0 ?
                    <svg width={width} height={height} role="img" aria-label={ariaLabel}>
                        {rows.map((row, r) => (
                            <g key={row.key}>
                                <text className={styles.rowLabel} x={labelW - 10} y={r * (cellH + gap) + cellH / 2} textAnchor="end" dominantBaseline="middle">{row.label}</text>
                                {columns.map((column, c) => {
                                    const value = cell(row.key, column.key)
                                    const cx = labelW + c * cellW
                                    const cy = r * (cellH + gap)
                                    const cls = value.value === null ? styles.heatEmpty : value.over ? styles.heatOver : heatClass(value.value)
                                    const showTip = () => setTip({
                                        x: cx + cellW / 2,
                                        y: cy + cellH / 2,
                                        title: `${row.label} · ${column.label}`,
                                        rows: [{ label: value.over ? overLabel : "", value: value.display }, ...(value.details ?? [])],
                                    })
                                    return (
                                        <g key={column.key} tabIndex={0} className={styles.heatGroup} onPointerEnter={showTip} onFocus={showTip} onBlur={() => setTip(null)} aria-label={`${row.label}, ${column.label}: ${value.display}`}>
                                            <rect className={cls} x={cx + gap / 2} y={cy} width={cellW - gap} height={cellH} rx={3} />
                                            {value.over && cellW > 18 ? <text className={styles.overMark} x={cx + cellW / 2} y={cy + cellH / 2} textAnchor="middle" dominantBaseline="central">!</text> : null}
                                        </g>
                                    )
                                })}
                            </g>
                        ))}
                        {columns.map((column, c) => (c === columns.length - 1 || (c % every === 0 && columns.length - 1 - c >= every)) ?
                            <text key={column.key} className={styles.axisText} x={labelW + c * cellW + cellW / 2} y={height - 8} textAnchor="middle">{column.label}</text>
                        : null)}
                    </svg>
                : null}
                <Tooltip tip={tip} containerWidth={width} />
            </div>
            <div className={styles.heatLegend}>
                <span>{legendLow}</span>
                {HEAT_STEPS.map((step, i) => <i key={step} className={styles[`heat${i + 1}`]} />)}
                <span>{legendHigh}</span>
                {hasOver ? <span className={styles.heatLegendOver}><i className={styles.heatOver}>!</i>{overLabel}</span> : null}
                <span className={styles.heatLegendEmpty}><i className={styles.heatEmpty} />{emptyLabel}</span>
            </div>
        </div>
    )
}

// ---------- Stat tile ----------

type StatTileProps = {
    label: string,
    value: string,
    unit?: string,
    delta?: { text: string, good: boolean | null } | null, // null good = neutral
    caption?: string,
}

export function StatTile({ label, value, unit, delta, caption }: StatTileProps) {
    return (
        <div className={styles.tile}>
            <p className={styles.tileLabel}>{label}</p>
            <p className={styles.tileValue}>{value}{unit ? <span className={styles.tileUnit}> {unit}</span> : null}</p>
            {delta ?
                <p className={`${styles.tileDelta} ${delta.good === null ? "" : delta.good ? styles.deltaGood : styles.deltaBad}`}>
                    <span aria-hidden="true">{delta.good === null ? "•" : delta.text.startsWith("-") || delta.text.startsWith("−") ? "▼" : "▲"}</span> {delta.text}
                </p>
            : null}
            {caption ? <p className={styles.tileCaption}>{caption}</p> : null}
        </div>
    )
}
