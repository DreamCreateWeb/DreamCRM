/**
 * THE chart theme — single home for every value a DreamCRM chart derives its
 * look from. Client-safe constants only.
 *
 * Series colors ride the `--color-chart-*` custom properties (app/css/
 * style.css), which are VALIDATED (dataviz six-checks: lightness band, chroma
 * floor, CVD separation, normal-vision floor, 3:1 surface contrast) against
 * both surfaces and flip for dark mode at the token layer — components never
 * branch on theme. Assignment is FIXED order, never cycled: series 1 is
 * always chart-1 (the brand blue), a 5th series is a design decision, not a
 * generated hue.
 */

/** Fixed series order. Single-series charts always use CHART_SERIES[0]. */
export const CHART_SERIES = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
] as const

/** One point of a single-series trend — the shape every stat service already
 *  returns ({ bucket, value }), so call sites pass their data straight in. */
export interface TrendPoint {
  bucket: string
  value: number
}

/** Default number rendering for tooltips/axes when no formatter is given. */
export function formatChartValue(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

/**
 * Thin the X tick labels to ~`target` evenly-spaced ones (first + last always
 * kept) — 12 weekly buckets at mobile width would otherwise collide.
 * Returns the indices to KEEP.
 */
export function tickIndices(count: number, target = 6): number[] {
  if (count <= target) return Array.from({ length: count }, (_, i) => i)
  const step = Math.ceil((count - 1) / (target - 1))
  const keep = new Set<number>()
  for (let i = 0; i < count; i += step) keep.add(i)
  keep.add(count - 1)
  return Array.from(keep).sort((a, b) => a - b)
}
