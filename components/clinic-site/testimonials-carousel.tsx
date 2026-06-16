'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'

// Prev/next buttons sit on the page ground → derived neutral vars. The card
// surface itself is the brand-derived deep band (see TestimonialCard below).
const BTN_BG = 'var(--c-surface, #FFFFFF)'
const BTN_BORDER = 'var(--c-border, #E8E2D9)'
const BTN_INK = 'var(--c-ink, #1C1A17)'

// Match the CSS `transition-duration` on the track. Slightly-padded
// timeout matches the visible animation length so the snap-back fires
// AFTER the animation completes, not during it.
const TRANSITION_MS = 500
const SNAP_DELAY_MS = TRANSITION_MS + 50

interface Props {
  testimonials: ClinicTestimonial[]
  brand: string
}

/**
 * Arrow-paginated testimonials carousel — matches Tend's "Why people love us"
 * section. Single-card focus on desktop with sliver-peeks on both sides,
 * prev/next buttons in the top-right, keyboard left/right nav.
 *
 * Infinite-loop behavior: the track renders 2N cards (originals duplicated
 * once); when the index advances PAST the first set (index >= count) we
 * let the animation land on the duplicate, then snap (no transition) back
 * to the equivalent in-range index. The user sees a seamless ongoing
 * stream rather than a hard reset to position 0.
 *
 * Renders client-side because the prev/next + index state are interactive;
 * static SSR markup still shows the first set on first paint.
 */
export default function TestimonialsCarousel({ testimonials, brand: _brand }: Props) {
  // `brand` is accepted for backwards-compat with existing callers but
  // intentionally unused — the v2 card surface is fixed forest-teal.
  const count = testimonials.length

  // Index can transiently overshoot [0, count) during the snap-back
  // window — that's intentional. `transitionOn` is briefly toggled off
  // while we snap so the user doesn't see the reset.
  const [index, setIndex] = useState(0)
  const [transitionOn, setTransitionOn] = useState(true)

  const goPrev = useCallback(() => {
    setTransitionOn(true)
    setIndex((i) => i - 1)
  }, [])
  const goNext = useCallback(() => {
    setTransitionOn(true)
    setIndex((i) => i + 1)
  }, [])

  // Keyboard nav — left/right arrows page the carousel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  // Snap-back: after the animation finishes, if we're outside [0, count),
  // disable transition and shift index by ±count so we're back in range
  // visually identical to the post-animation frame. Re-enable transition
  // immediately so the next interaction animates normally.
  useEffect(() => {
    if (count <= 1) return
    if (index >= 0 && index < count) return
    const t = setTimeout(() => {
      setTransitionOn(false)
      setIndex((i) => (i >= count ? i - count : i + count))
      // Re-enable transition on the next frame so subsequent interactions
      // animate. Using rAF instead of another setTimeout because we want
      // the no-transition state to apply for exactly one paint.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTransitionOn(true))
      })
    }, SNAP_DELAY_MS)
    return () => clearTimeout(t)
  }, [index, count])

  if (count === 0) return null

  if (count === 1) {
    return (
      <div className="max-w-2xl">
        <TestimonialCard t={testimonials[0]} />
      </div>
    )
  }

  // Doubled track for the seamless wrap. The second copy gives us a real
  // card to slide INTO when the user advances past index count-1 → count;
  // after the animation we snap back to index 0 (or N-1 on prev-wrap).
  const doubled = [...testimonials, ...testimonials]

  return (
    <div
      aria-roledescription="carousel"
      aria-label="Patient testimonials"
      className="relative"
      tabIndex={0}
    >
      <div className="flex items-center justify-end gap-3 mb-8 sm:mb-10">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous testimonial"
          className="w-12 h-12 rounded-full flex items-center justify-center transition hover:shadow-sm"
          style={{ backgroundColor: BTN_BG, border: `1px solid ${BTN_BORDER}`, color: BTN_INK }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Next testimonial"
          className="h-12 px-5 rounded-full inline-flex items-center gap-2 transition hover:shadow-sm text-sm font-semibold tracking-wide"
          style={{ backgroundColor: BTN_BG, border: `1px solid ${BTN_BORDER}`, color: BTN_INK }}
        >
          <span>NEXT</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      {/* overflow-x-clip on the wrapper instead of the section so the peek
          cards stay within the section's max-w but don't push the page
          wider than the viewport on narrow screens. clip beats hidden
          because it doesn't establish a scroll container (which would
          break sticky positioning further up the page). */}
      <div className="-mx-5 sm:-mx-8 px-5 sm:px-8" style={{ overflowX: 'clip' }}>
        <ul
          className="flex gap-6 lg:gap-8"
          style={{
            transition: transitionOn
              ? `transform ${TRANSITION_MS}ms ease-out`
              : 'none',
            transform: `translateX(calc(var(--tm-step, -100%) * ${index}))`,
          }}
        >
          {doubled.map((t, i) => {
            // For aria, hide cards that are NOT adjacent to the visible
            // one. Use modular distance so the wrap-around copies count
            // as "the same" position.
            const norm = ((i - index) % count + count) % count
            const isVisibleish = norm === 0 || norm === 1 || norm === count - 1
            return (
              <li
                key={i}
                className="shrink-0 basis-full md:basis-3/4 lg:basis-2/3 min-w-0"
                aria-hidden={isVisibleish ? undefined : 'true'}
              >
                <TestimonialCard t={t} />
              </li>
            )
          })}
        </ul>
      </div>
      <style>{`
        @media (min-width: 768px) {
          [aria-roledescription="carousel"] ul { --tm-step: calc(-75% - 1.5rem); }
        }
        @media (min-width: 1024px) {
          [aria-roledescription="carousel"] ul { --tm-step: calc(-66.667% - 2rem); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-roledescription="carousel"] ul { transition: none !important; }
        }
      `}</style>
    </div>
  )
}

/**
 * Single testimonial card — Tend-verbatim composition. Dark card (the brand-
 * DERIVED deep band, same `var(--c-deep)` as the footer) with white quote text
 * + gold 5-star row and author. Quote is unbounded vertically; the flex-end
 * footer pins stars/author to the bottom even on short reviews.
 *
 * `brand` is intentionally unused on the card — the deep surface comes from the
 * layout palette vars (derived from the brand once), so the carousel reads as a
 * deliberate dark rhythm-break grounded in the clinic's OWN color. Gold stars
 * stay gold (universal review signal).
 */
const TESTIMONIAL_CARD_BG = 'var(--c-deep, #36514c)'
const TESTIMONIAL_CARD_STAR = '#FFCC00'

export function TestimonialCard({ t }: { t: ClinicTestimonial; brand?: string }) {
  return (
    <figure
      className="rounded-2xl sm:rounded-3xl p-6 sm:p-10 lg:p-12 flex flex-col h-full"
      style={{ backgroundColor: TESTIMONIAL_CARD_BG }}
    >
      <blockquote
        className="text-base sm:text-lg lg:text-xl leading-[1.5] flex-1 mb-10 text-center"
        style={{ color: 'var(--c-deep-ink, #FFFFFF)' }}
      >
        {t.quote}
      </blockquote>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <p
          className="text-base lg:text-lg leading-none tracking-widest"
          style={{ color: TESTIMONIAL_CARD_STAR }}
          aria-label="5 out of 5 stars"
        >
          ★★★★★
        </p>
        <figcaption className="text-sm lg:text-[15px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
          <strong className="font-semibold" style={{ color: 'var(--c-deep-ink, #FFFFFF)' }}>
            {t.authorName}
          </strong>
          {t.authorLocation && (
            <span style={{ color: 'rgba(255,255,255,0.65)' }}> {t.authorLocation}</span>
          )}
        </figcaption>
      </div>
    </figure>
  )
}
