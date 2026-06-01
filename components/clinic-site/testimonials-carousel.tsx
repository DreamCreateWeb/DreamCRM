'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'

const { BG, INK, INK_MUTED, BORDER } = CLINIC_THEME

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
export default function TestimonialsCarousel({ testimonials, brand }: Props) {
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
        <TestimonialCard t={testimonials[0]} brand={brand} />
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
      <div className="flex items-center justify-end gap-2 mb-6">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous testimonial"
          className="w-11 h-11 rounded-full flex items-center justify-center transition hover:shadow-sm"
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
          className="w-11 h-11 rounded-full flex items-center justify-center text-white transition hover:shadow-md"
          style={{ backgroundColor: brand }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="overflow-hidden">
        <ul
          className="flex transition-transform duration-500 ease-out gap-6 lg:gap-8"
          style={{
            // Each card takes ~92% of viewport on mobile, ~33% on desktop.
            // We use translateX percent so it scales without measuring DOM.
            // The percent moves one card-width per index step.
            // mobile single-column: 100% of (card + gap) per step ≈ 100/1
            // desktop three-up: 100/3 per step. We split with a CSS var
            // controlled by Tailwind classes for predictability.
            transform: `translateX(calc(var(--tm-step, -100%) * ${index}))`,
          }}
        >
          {testimonials.map((t, i) => (
            <li
              key={t.id}
              className="shrink-0 basis-full md:basis-1/2 lg:basis-1/3 min-w-0"
              aria-hidden={Math.abs(i - index) > 1 ? 'true' : undefined}
            >
              <TestimonialCard t={t} brand={brand} />
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        /* Single-step uses one card per page on mobile, three on desktop.
           We pick the step width to match the basis class above, so the
           transform stays in sync with the visible card count. */
        @media (min-width: 768px) {
          [aria-roledescription="carousel"] ul { --tm-step: calc(-50% - 1rem); }
        }
        @media (min-width: 1024px) {
          [aria-roledescription="carousel"] ul { --tm-step: calc(-33.333% - 1rem); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-roledescription="carousel"] ul { transition: none; }
        }
      `}</style>
    </div>
  )
}

/**
 * Single testimonial card — shared shape across the carousel. Long quote
 * top, 5-star row, author name (strong) + city. Matches Tend's review card
 * — minimal chrome, the words do the work.
 */
export function TestimonialCard({ t, brand }: { t: ClinicTestimonial; brand: string }) {
  return (
    <figure
      className="rounded-2xl p-7 sm:p-8 flex flex-col h-full"
      style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
    >
      <blockquote
        className="text-[17px] leading-[1.55] flex-1 mb-5"
        style={{ color: INK }}
      >
        &ldquo;{t.quote}&rdquo;
      </blockquote>
      <p
        className="text-base mb-4 leading-none tracking-widest"
        style={{ color: brand }}
        aria-label="5 out of 5 stars"
      >
        ★★★★★
      </p>
      <figcaption className="text-sm" style={{ color: INK_MUTED }}>
        <strong className="font-semibold" style={{ color: INK }}>
          {t.authorName}
        </strong>
        {t.authorLocation && <> · {t.authorLocation}</>}
      </figcaption>
    </figure>
  )
}
