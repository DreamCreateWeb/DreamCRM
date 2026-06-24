import 'server-only'

/**
 * The 30/90-day window the SEO + Analytics metric tiles toggle between, and the
 * demo-baseline scaler. gbp-metrics.ts and social-metrics.ts are documented
 * twins; both re-implemented this clamp + scale, so a 3rd window (say 7-day)
 * could have landed in one and not the other. One copy now.
 */

export const DEFAULT_WINDOW_DAYS = 30

/** Clamp an incoming `days` to the supported window: 90 stays 90, any other
 *  positive number floors to itself, missing/invalid falls back to 30. */
export function normalizeMetricsWindow(days?: number): number {
  return days === 90 ? 90 : days && days > 0 ? Math.floor(days) : DEFAULT_WINDOW_DAYS
}

/** Scale a per-30-day demo baseline to the active window (linear, rounded). */
export function scaleToWindow(value: number, windowDays: number): number {
  return Math.round(value * (windowDays / 30))
}
