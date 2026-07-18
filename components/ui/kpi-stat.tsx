'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Sparkline from '@/components/ui/sparkline'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

/** sessionStorage flag — count-up runs once per session entry, never on
 *  re-query/filter/drawer (DESIGN-SYSTEM.md Part 3). */
const COUNTUP_FLAG = 'v2-countup-done'
const COUNTUP_MS = 700

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Count-up display for a numeric KPI hero number. Renders the final value for
 * SSR (no hydration flash), then — only on the first dashboard entry of the
 * session, only with motion allowed — ramps 0 → value once (≤700ms, ease-out).
 * Snaps to the final value under reduced-motion or on later mounts.
 */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    let done = false
    try {
      done = sessionStorage.getItem(COUNTUP_FLAG) === '1'
    } catch {
      // sessionStorage can throw (privacy mode) — treat as "already done".
      done = true
    }
    if (done) return
    try {
      sessionStorage.setItem(COUNTUP_FLAG, '1')
    } catch {
      /* ignore */
    }

    const from = 0
    const start = performance.now()
    setDisplay(from)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNTUP_MS)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
    // Run once per mount; value is stable for a given tile render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{display.toLocaleString()}</>
}

/**
 * Standard KPI / stat tile. Every number is drillable when it has somewhere
 * to go — pass `href` and the whole tile links to the filtered view that
 * explains it. Hero numerals are Geist Mono (the "financial instrument"
 * signature); labels never drop below text-xs; zero values keep full contrast
 * (an empty queue is information, not decoration). Etched card, no resting
 * shadow; hover lift only when drillable.
 *
 * Pass `countUp` ONLY on the Overview hero KPIs — it ramps the number on the
 * first session entry (Part 3), never on re-query/filter.
 */
export function KpiStat({
  label,
  value,
  sub,
  tone,
  href,
  countUp = false,
  spark,
  className = '',
}: {
  label: string
  value: ReactNode
  /** One-line context under the number ("3 need a reminder"). */
  sub?: ReactNode
  /** Tone for `sub` (e.g. 'warn' when the number needs action). */
  tone?: Tone
  /** Where clicking the number takes you — the filtered list behind it. */
  href?: string
  /** Count-up on first session entry — Overview hero KPIs only. */
  countUp?: boolean
  /** The tile's heartbeat (v3 law 7): a small real-data trend series drawn
   *  bottom-right in the brand hue. One heartbeat per tile — don't pair with
   *  a delta `sub` carrying the same story. Hidden under 480px. */
  spark?: Array<{ bucket: string; value: number }>
  className?: string
}) {
  const card = (
    <div
      className={`${href ? 'v2-card-interactive' : 'v2-card'} relative p-4 h-full ${className}`}
    >
      <div className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">
        {countUp && typeof value === 'number' ? <CountUp value={value} /> : value}
      </div>
      {sub && <div className={`mt-0.5 text-xs font-medium ${tone ? TONE_TEXT[tone] : 'text-gray-600 dark:text-gray-300'}`}>{sub}</div>}
      {spark && spark.length > 1 && (
        <div className="pointer-events-none absolute bottom-3 right-3 hidden xs:block" aria-hidden="true">
          <Sparkline data={spark} color="var(--color-teal-500)" width={88} height={30} labels={false} />
        </div>
      )}
    </div>
  )
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {card}
      </Link>
    )
  }
  return card
}
