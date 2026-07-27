'use client'

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Tooltip,
  XAxis,
} from 'recharts'
import ChartTooltip from './chart-tooltip'
import { CHART_SERIES, formatChartValue, type TrendPoint } from './chart-theme'

/**
 * The in-card / in-table sparkline — small enough to sit beside a number, but
 * a REAL chart: hovering reads out the bucket + value in the shared tooltip.
 * No axes (the surrounding tile carries the headline; the tooltip carries the
 * detail), hidden X axis only so the tooltip knows its labels.
 *
 * Replaces the old server-rendered `<Sparkline>` polylines, which had no
 * hover and no numbers — decorations posing as graphs.
 */
export default function MiniTrend({
  data,
  variant = 'line',
  color = CHART_SERIES[0],
  width = 104,
  height = 28,
  valueFormatter = formatChartValue,
}: {
  data: TrendPoint[]
  variant?: 'line' | 'bar'
  color?: string
  width?: number
  height?: number
  valueFormatter?: (v: number) => string
}) {
  if (data.length === 0) {
    return (
      <div
        className="text-xs text-gray-400 dark:text-gray-500 italic flex items-center justify-center"
        style={{ height, width }}
        data-chart="mini-empty"
      >
        No data yet
      </div>
    )
  }

  const tooltip = (
    <Tooltip
      content={<ChartTooltip valueFormatter={valueFormatter} />}
      cursor={{ stroke: 'var(--color-hairline-strong)', strokeWidth: 1 }}
      isAnimationActive={false}
      // The spark is tiny and usually right-aligned in a card — let the
      // tooltip escape the plot box instead of clipping at its edge.
      allowEscapeViewBox={{ x: true, y: true }}
      wrapperStyle={{ zIndex: 20 }}
    />
  )

  return (
    <div data-chart={`mini-${variant}`} style={{ width, height }}>
      {variant === 'bar' ? (
          <BarChart data={data} width={width} height={height} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="bucket" hide />
            <Tooltip
              content={<ChartTooltip valueFormatter={valueFormatter} />}
              cursor={{ fill: 'var(--color-hairline)' }}
              isAnimationActive={false}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20 }}
            />
            <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
      ) : (
          <LineChart data={data} width={width} height={height} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <XAxis dataKey="bucket" hide />
            {tooltip}
            <Line
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 1.5, stroke: 'var(--color-surface-2)' }}
              isAnimationActive={false}
            />
          </LineChart>
      )}
    </div>
  )
}
