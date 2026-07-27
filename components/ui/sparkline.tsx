'use client'

/**
 * COMPAT WRAPPER (2026-07-26, the Recharts rollout). `Sparkline` was a
 * server-rendered polyline with no hover, no axes, no numbers — every call
 * site now renders the real chart kit underneath (components/ui/charts):
 * MiniTrend gives each spark a crosshair tooltip that reads out bucket +
 * value on hover.
 *
 * Kept as a wrapper so the 8 existing call sites upgrade in place; NEW
 * surfaces should import from '@/components/ui/charts' directly — TrendChart
 * for anything with room for axes, MiniTrend for in-card sparks.
 *
 * API notes vs the old component:
 *  - `labels` is accepted but ignored: hover tooltips are always on now
 *    (that was the whole point).
 *  - `color` still accepts any CSS color, but pass CHART_SERIES entries so
 *    dark mode + the palette validation apply.
 */
import MiniTrend from './charts/mini-trend'
import { CHART_SERIES, type TrendPoint } from './charts/chart-theme'

interface SparklineProps {
  data: TrendPoint[]
  variant?: 'line' | 'bar'
  color?: string
  height?: number
  width?: number
  /** Ignored — the kit always shows hover values. */
  labels?: boolean
}

export default function Sparkline({
  data,
  variant = 'line',
  color = CHART_SERIES[0],
  height = 48,
  width = 240,
}: SparklineProps) {
  return <MiniTrend data={data} variant={variant} color={color} width={width} height={height} />
}
