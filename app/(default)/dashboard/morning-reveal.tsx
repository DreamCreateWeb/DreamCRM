'use client'

import { Children, useEffect, useState, type ReactNode } from 'react'

/**
 * Signature moment #1 — the "morning reveal" (DESIGN-SYSTEM.md Part 3).
 *
 * On the FIRST dashboard entry of a session, the attention-cards row cascades
 * in once: a 50ms stagger across the first cards, spring-gentle easing,
 * y(8px) + fade. KPIs count up in the same beat (KpiStat owns that, gated on a
 * sibling `v2-countup-done` flag). The PageHeader aura halo is always present.
 *
 * Mechanics, deliberately tiny + self-contained (no global keyframes, so it
 * can't collide with other modules' CSS):
 *  - Children render STATIC for SSR and on every later visit — no hydration
 *    flash, no layout jump, the cards keep their exact grid positions.
 *  - After mount we decide ONCE whether this is the first session entry (a
 *    sessionStorage flag, sibling to KpiStat's count-up flag) and whether
 *    motion is allowed. Only then do we run the cascade: each wrapped card
 *    starts at opacity-0 + y(8px), then on the next frame transitions to
 *    its resting state with a per-card delay (50ms step, capped at 8).
 *  - Cards beyond the cap and every later visit render with no animation.
 *  - Reduced-motion: the cascade never arms — everything is static.
 *
 * The wrapper is layout-transparent: it takes the same grid classes the row
 * used before via `className`, and each card sits in a plain <div> cell.
 */

/** sessionStorage flag — reveal runs once per session entry, like count-up. */
const REVEAL_FLAG = 'v2-reveal-done'
/** Stagger step + cap, per the spec (50ms; 6–8 cards). */
const STAGGER_MS = 50
const STAGGER_CAP = 8
/** Lift distance for the fade-in (px) — matches the spec's y(8px). */
const LIFT_PX = 8

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

type Phase = 'static' | 'armed' | 'shown'

export function MorningReveal({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  // 'static' = no animation (SSR, later visits, reduced-motion).
  // 'armed'  = first paint of the cascade: cards hidden + lifted.
  // 'shown'  = transition to resting state (with the per-card delay).
  const [phase, setPhase] = useState<Phase>('static')

  useEffect(() => {
    if (prefersReducedMotion()) return
    let done = false
    try {
      done = sessionStorage.getItem(REVEAL_FLAG) === '1'
    } catch {
      // sessionStorage can throw (privacy mode) — treat as "already done".
      done = true
    }
    if (done) return
    try {
      sessionStorage.setItem(REVEAL_FLAG, '1')
    } catch {
      /* ignore */
    }
    // Arm hidden, then flip to shown on the next frame so the transition runs.
    setPhase('armed')
    const raf = requestAnimationFrame(() => setPhase('shown'))
    return () => cancelAnimationFrame(raf)
    // Run once per mount; the flag guarantees once-per-session regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = Children.toArray(children)
  const animating = phase !== 'static'

  return (
    <div className={className}>
      {items.map((child, i) => {
        const inCascade = animating && i < STAGGER_CAP
        // While animating, every card transitions; only the first cards in the
        // cascade carry a stagger delay (the rest resolve with the row).
        const style: React.CSSProperties | undefined = animating
          ? {
              opacity: phase === 'armed' ? 0 : 1,
              transform: phase === 'armed' ? `translateY(${LIFT_PX}px)` : 'translateY(0)',
              // Spring-gentle settle over the slow duration — the spec's
              // named easing for the morning cascade.
              transition:
                'opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--spring-gentle)',
              transitionDelay: inCascade ? `${i * STAGGER_MS}ms` : '0ms',
              willChange: phase === 'shown' ? 'opacity, transform' : undefined,
            }
          : undefined
        return (
          <div key={i} style={style}>
            {child}
          </div>
        )
      })}
    </div>
  )
}
