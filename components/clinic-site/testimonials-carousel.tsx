'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'

// Only INK + BORDER survive — the prev/next button uses them.
// Card surface + text colors are fixed to the dark forest-teal palette
// (see TestimonialCard below).
const { INK, BORDER } = CLINIC_THEME

interface Props {
  testimonials: ClinicTestimonial[]
  brand: string
}

/**
 * Arrow-paginated testimonials carousel — matches Tend's "Why people love us"
 * section. One card visible at a time on mobile, three on desktop, with
 * prev/next buttons in the top-right and keyboard left/right nav.
 *
 * Replaces the prior CSS-marquee — Tend's actual implementation is a
 * splide-style paged carousel, and the marquee felt frenetic against the
 * otherwise-still page rhythm. Renders client-side because the prev/next
 * + index state are interactive; the static markup below is what shows
 * on first paint so SSR + zero-JS visitors still see the first set.
 */
export default function TestimonialsCarousel({ testimonials, brand: _brand }: Props) {
  // `brand` is accepted for backwards-compat with existing callers but
  // intentionally unused — the v2 card surface is fixed forest-teal.
  // We page three cards at a time on desktop. The index tracks the LEAD
  // card so prev/next moves one card at a time (not one page) — feels
  // more deliberate to read than a hard page jump.
  const [index, setIndex] = useState(0)
  const count = testimonials.length
  // visible-window size by breakpoint — kept simple, we just always render
  // ALL cards in a horizontal track and translateX by index * cardWidth.
  // Tailwind handles per-breakpoint card width via flex-basis classes.

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + count) % count)
  }, [count])
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % count)
  }, [count])

  // Keyboard nav — left/right arrows page the carousel when it has focus
  // (the wrapper carries tabIndex={0}). Tend mounts this on the whole
  // section so any focus inside cycles cards; we keep it scoped to the
  // wrapper so it doesn't fight form inputs elsewhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  if (count === 0) return null

  // For a single testimonial, skip the carousel chrome entirely — buttons
  // would page in place and look broken with no visual change.
  if (count === 1) {
    return (
      <div className="max-w-2xl">
        <TestimonialCard t={testimonials[0]} />
      </div>
    )
  }

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
          style={{ backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }}
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
          style={{ backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }}
        >
          <span>NEXT</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="overflow-visible">
        <ul
          className="flex transition-transform duration-500 ease-out gap-6 lg:gap-8"
          style={{
            // Step moves the track by one card-width per click. Single-card
            // focus with significant peeks on both sides (Tend's verbatim).
            // Mobile = full width, tablet/desktop = ~66% with peek so the
            // next/prev card hints visible at the edges.
            transform: `translateX(calc(var(--tm-step, -100%) * ${index}))`,
          }}
        >
          {testimonials.map((t, i) => (
            <li
              key={t.id}
              className="shrink-0 basis-full md:basis-3/4 lg:basis-2/3 min-w-0"
              aria-hidden={Math.abs(i - index) > 1 ? 'true' : undefined}
            >
              <TestimonialCard t={t} />
            </li>
          ))}
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
          [aria-roledescription="carousel"] ul { transition: none; }
        }
      `}</style>
    </div>
  )
}

/**
 * Single testimonial card — Tend-verbatim composition. Dark forest-teal
 * card (`#36514c`, same hex as the footer) with white quote text + gold
 * 5-star row bottom-left and author bottom-right. Quote is unbounded
 * vertically; the flex-end footer pins stars/author to the bottom even
 * on short reviews.
 *
 * `brand` is intentionally unused on the card — the dark surface is fixed
 * to the forest-teal regardless of clinic brand color so the carousel
 * reads as a deliberate visual break, not as another brand-color tint.
 */
const TESTIMONIAL_CARD_BG = '#36514c'
const TESTIMONIAL_CARD_STAR = '#FFCC00'

export function TestimonialCard({ t }: { t: ClinicTestimonial; brand?: string }) {
  return (
    <figure
      className="rounded-3xl p-8 sm:p-10 lg:p-12 flex flex-col h-full"
      style={{ backgroundColor: TESTIMONIAL_CARD_BG }}
    >
      <blockquote
        className="text-base sm:text-lg lg:text-xl leading-[1.5] flex-1 mb-10 text-center"
        style={{ color: '#FFFFFF' }}
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
          <strong className="font-semibold" style={{ color: '#FFFFFF' }}>
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
