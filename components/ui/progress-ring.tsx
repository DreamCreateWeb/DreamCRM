'use client'

import { useEffect, useState } from 'react'

/**
 * Progress ring — a v3 "heartbeat" element (DESIGN-SYSTEM.md law 7): a small
 * brand-blue ring that fills once on mount (≤1.1s, spring-ish ease) to show
 * a share-of-whole at a glance (e.g. "11 of 14 confirmed").
 *
 * Rules: one heartbeat per surface; always pair with a visible text label —
 * the ring is decoration for a number, never the only encoding (the % text
 * inside + `label` aria cover it). Renders nothing when max ≤ 0 (an empty
 * day is an EmptyState's job, not a 0% ring). Reduced-motion snaps to the
 * final fill.
 */
export function ProgressRing({
  value,
  max,
  size = 40,
  label,
  className = '',
}: {
  value: number
  max: number
  /** Rendered box size in px. */
  size?: number
  /** Accessible description, e.g. "11 of 14 confirmed". REQUIRED. */
  label: string
  className?: string
}) {
  const clamped = Math.max(0, Math.min(value, max))
  const pct = max > 0 ? clamped / max : 0
  const r = size * 0.4
  const c = 2 * Math.PI * r
  const target = c * (1 - pct)

  const [offset, setOffset] = useState(c)
  const [animate, setAnimate] = useState(true)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setAnimate(false)
      setOffset(target)
      return
    }
    // Next frame so the initial (empty) state paints and the transition runs.
    const raf = requestAnimationFrame(() => setOffset(target))
    return () => cancelAnimationFrame(raf)
  }, [target])

  if (max <= 0) return null

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-grid place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-teal-500)"
          strokeOpacity="0.18"
          strokeWidth={size * 0.11}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-teal-500)"
          strokeWidth={size * 0.11}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={animate ? { transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 0.9, 0.35, 1)' } : undefined}
        />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums text-teal-700 dark:text-teal-300">
        {Math.round(pct * 100)}
      </span>
    </span>
  )
}
