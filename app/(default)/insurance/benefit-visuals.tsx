'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ProgressRing } from '@/components/ui/progress-ring'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { describeBenefitAmount, type BenefitAmount } from '@/lib/insurance-eligibility'

/**
 * The insurance card's own visual furniture — local to the module by law
 * (DESIGN-SYSTEM.md Part 6: module agents don't edit `components/ui`). Two
 * pieces the kit lacks are built here and noted as a gap for it: a labelled
 * FILL BAR (a share-of-whole meter with no ring) and the HERO AMOUNT (a big
 * mono number beside the kit's ProgressRing).
 *
 * Law 7 ("every number wants a heartbeat") meets THE HONESTY LAW here: a
 * ring or a bar is drawn ONLY from `describeBenefitAmount`'s `fractionUsed`,
 * which exists only when the payer stated both ends. A caveat gets copy, not
 * a heartbeat — the honesty rule beats the heartbeat rule.
 */

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * A thin brand-hue meter that fills once on mount (≤1.1s, Part 3's
 * heartbeat budget; reduced-motion snaps). Pure divs — no SVG, so the
 * chart-kit guard has nothing to say. `pct` is 0–100; null draws an empty
 * track (the number beside it says "—").
 */
export function FillBar({ pct, label }: { pct: number | null; label: string }) {
  const target = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const [width, setWidth] = useState(0)
  const [animate, setAnimate] = useState(true)
  useEffect(() => {
    if (prefersReducedMotion()) {
      setAnimate(false)
      setWidth(target)
      return
    }
    const raf = requestAnimationFrame(() => setWidth(target))
    return () => cancelAnimationFrame(raf)
  }, [target])
  return (
    <div
      className="h-1.5 w-full rounded-full bg-teal-500/15 overflow-hidden"
      role="img"
      aria-label={label}
      title={label}
      data-testid="fill-bar"
      data-pct={pct == null ? '' : String(target)}
    >
      <div
        className="h-full rounded-full bg-teal-500"
        style={{ width: `${width}%`, transition: animate ? 'width 1.1s cubic-bezier(0.22, 0.9, 0.35, 1)' : undefined }}
      />
    </div>
  )
}

/**
 * One coverage tier: "Preventive · 100%" over its fill bar. "—" when the
 * payer never said; "Not covered" at 0. Both in the neutral tone — an unstated
 * tier is not a warning, it is an absence.
 */
export function TierTile({ label, hint, pct }: { label: string; hint: string; pct: number | null }) {
  return (
    <div className="v2-well px-3 py-2.5 min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 truncate">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-tight">
        {pct == null ? (
          <span className={TONE_TEXT.neutral} aria-label="not stated">
            —
          </span>
        ) : pct === 0 ? (
          <span className={`text-sm font-semibold ${TONE_TEXT.neutral}`}>Not covered</span>
        ) : (
          `${pct}%`
        )}
      </p>
      <div className="mt-1.5">
        <FillBar pct={pct} label={pct == null ? `${label}: the payer didn’t say` : `${label}: plan pays ${pct}%`} />
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{hint}</p>
    </div>
  )
}

/**
 * The scoreboard number: "$1,240 left" as a text-4xl mono hero with the
 * kit's ProgressRing beside it when, and only when, the payer stated both
 * ends. The sub-line is the honesty copy, warn-toned when it is a caveat.
 */
export function HeroAmount({
  eyebrow,
  amount,
  kind,
  ringSize = 56,
  size = 'hero',
  children,
}: {
  eyebrow: string
  amount: BenefitAmount | null | undefined
  kind: 'max' | 'deductible'
  ringSize?: number
  /** 'hero' = text-4xl (the one big number); 'tile' = text-2xl beside it. */
  size?: 'hero' | 'tile'
  children?: ReactNode
}) {
  const copy = describeBenefitAmount(amount, kind)
  if (!copy) return null
  const usedPct = copy.fractionUsed == null ? null : Math.round(copy.fractionUsed * 100)
  const noun = kind === 'max' ? 'of the yearly maximum used' : 'of the deductible met'
  return (
    <div className="flex items-center gap-4 min-w-0">
      {usedPct != null && (
        <ProgressRing value={usedPct} max={100} size={ringSize} label={`${usedPct}% ${noun}`} className="shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">{eyebrow}</p>
        <p
          className={`${size === 'hero' ? 'text-4xl' : 'text-2xl'} font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none mt-1`}
          data-testid={kind === 'max' ? 'hero-max' : 'hero-deductible'}
        >
          {copy.headline}
        </p>
        <p className={`mt-1 text-xs ${copy.caveat ? TONE_TEXT.warn : 'text-gray-500 dark:text-gray-400'}`}>{copy.sub}</p>
        {children}
      </div>
    </div>
  )
}

/** A quiet fact chip for the plan-rules row ("Ortho lifetime maximum: $1,500 left"). */
export function FactChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunk)] px-2.5 py-1 text-xs text-gray-700 dark:text-gray-200 font-mono-num tabular-nums"
      title={title}
    >
      {children}
    </span>
  )
}
