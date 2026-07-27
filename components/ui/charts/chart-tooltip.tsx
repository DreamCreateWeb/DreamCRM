'use client'

import { formatChartValue } from './chart-theme'

/**
 * The shared Recharts tooltip body — v2-card chrome (surface token, hairline,
 * card shadow) instead of Recharts' inline-styled white box, so it belongs to
 * the design system in both themes. Text wears ink tokens; the series color
 * appears only as the identity dot beside the value (dataviz law: text never
 * wears the series color).
 *
 * Wired via Recharts' `content` prop; the props shape comes from Recharts at
 * runtime, typed loosely on purpose (their Tooltip generics fight custom
 * content for no gain).
 */
export default function ChartTooltip({
  active,
  label,
  payload,
  valueFormatter = formatChartValue,
}: {
  active?: boolean
  label?: string | number
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  valueFormatter?: (v: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] px-3 py-2 shadow-[var(--shadow-pop)]">
      {label != null && label !== '' && (
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-sm font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: p.color }}
          />
          {typeof p.value === 'number' ? valueFormatter(p.value) : p.value}
          {p.name && payload.length > 1 && (
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{p.name}</span>
          )}
        </p>
      ))}
    </div>
  )
}
