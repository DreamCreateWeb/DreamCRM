'use client'

import { useId } from 'react'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import ChartTooltip from './chart-tooltip'
import { useMeasuredWidth } from './use-measured-width'
import { CHART_SERIES, formatChartValue, tickIndices, type TrendPoint } from './chart-theme'

/**
 * THE full-size single-series trend chart — a real graph, not a decoration:
 * X labels, a compact Y scale, recessive gridlines, and a crosshair tooltip
 * that reads out the bucket + value under the pointer (the dataviz default:
 * an HTML chart IS interactive).
 *
 * Design-system compliance lives here once so call sites can't get it wrong:
 * ink-token axis text (never the series color), 2px line weight, thin
 * rounded bars, the brand hue by default, gradient area fills anchored to
 * the baseline, dark mode via the `--color-chart-*` tokens.
 *
 * Client component (Recharts) — server pages render it as an island. `data`
 * is the `{ bucket, value }[]` shape every stat service already returns.
 */
export default function TrendChart({
  data,
  kind = 'area',
  height = 220,
  color = CHART_SERIES[0],
  label,
  valueFormatter = formatChartValue,
  className = '',
  ariaLabel,
}: {
  data: TrendPoint[]
  kind?: 'area' | 'line' | 'bar'
  height?: number
  /** Series color — pass CHART_SERIES[n] (fixed order), never an ad-hoc hex. */
  color?: string
  /** Series name shown in the tooltip when useful (e.g. "new patients"). */
  label?: string
  valueFormatter?: (v: number) => string
  className?: string
  /** One sentence for AT — the visible axes carry it for sighted readers. */
  ariaLabel: string
}) {
  const gradientId = useId()
  // Measured container width (600 for SSR/first paint) — NOT Recharts'
  // ResponsiveContainer, which renders nothing until it measures.
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>(600)
  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 italic ${className}`}
        style={{ height }}
        data-chart="trend-empty"
      >
        No data yet
      </div>
    )
  }

  const keep = new Set(tickIndices(data.length))
  const axisTick = { fontSize: 12, fill: 'currentColor' } as const
  const common = {
    data,
    width,
    height,
    // right: 20 — the LAST x tick label centers under the final point and
    // clips at 8px (the QA screenshot showed "Jul 19" cut to "Jul 1").
    margin: { top: 8, right: 20, bottom: 0, left: 0 },
  }
  const xAxis = (
    <XAxis
      dataKey="bucket"
      tickLine={false}
      axisLine={false}
      tick={axisTick}
      interval={0}
      tickFormatter={(v: string, i: number) => (keep.has(i) ? v : '')}
      minTickGap={0}
    />
  )
  const yAxis = (
    <YAxis
      width={38}
      tickLine={false}
      axisLine={false}
      tick={axisTick}
      allowDecimals={false}
      tickFormatter={(v: number) => valueFormatter(v)}
    />
  )
  const grid = <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
  const tooltip = (
    <Tooltip
      content={<ChartTooltip valueFormatter={valueFormatter} />}
      cursor={{ stroke: 'var(--color-hairline-strong)', strokeWidth: 1 }}
      isAnimationActive={false}
    />
  )

  return (
    <div
      data-chart={`trend-${kind}`}
      role="img"
      aria-label={ariaLabel}
      ref={wrapRef}
      // Axis/tick text inherits THIS ink, never the series color.
      className={`text-gray-500 dark:text-gray-400 ${className}`}
    >
      {kind === 'bar' ? (
        <BarChart {...common}>
            {grid}
            {xAxis}
            {yAxis}
            <Tooltip
              content={<ChartTooltip valueFormatter={valueFormatter} />}
              cursor={{ fill: 'var(--color-hairline)' }}
              isAnimationActive={false}
            />
            <Bar dataKey="value" name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        ) : kind === 'line' ? (
          <LineChart {...common}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Line
              dataKey="value"
              name={label}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface-2)' }}
              isAnimationActive={false}
            />
          </LineChart>
        ) : (
          <AreaChart {...common}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Area
              dataKey="value"
              name={label}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface-2)' }}
              isAnimationActive={false}
            />
          </AreaChart>
      )}
    </div>
  )
}
