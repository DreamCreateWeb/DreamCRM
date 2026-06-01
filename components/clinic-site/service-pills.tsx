'use client'

import { useCallback, useRef } from 'react'

interface Pill {
  id: string
  name: string
}

interface Props {
  pills: Pill[]
  brand: string
  ink: string
  href: string
}

/**
 * Service-pill carousel with visible prev/next arrows — Tend's qualifier
 * strip just below the hero. Pills are horizontal-scrollable on mobile,
 * wrap on desktop. The arrow buttons scroll the row by ~one pill width on
 * click so visitors can page without horizontal-scrolling the page.
 *
 * Client component because the prev/next arrows need a click handler and
 * a ref to the scroll container — but everything else (rendering pills,
 * fallback layout, anchor targets) is identical to the prior server-side
 * pill row. SSR still paints the static markup; the JS is interaction-only.
 */
export default function ServicePills({ pills, brand, ink, href }: Props) {
  const trackRef = useRef<HTMLUListElement | null>(null)

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    // Move by ~70% of the track's visible width — one "page" of pills
    // without paging the whole row in one click.
    const step = Math.max(200, el.clientWidth * 0.7)
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }, [])

  if (pills.length === 0) return null

  return (
    <div className="relative">
      {/* Prev button */}
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Previous services"
        className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full items-center justify-center bg-white shadow-sm transition hover:shadow-md"
        style={{ border: `1px solid ${brand}66`, color: brand }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      {/* Track — centered on desktop when content fits, scrolls horizontally
          when it overflows. Pills are large (Tend-scale): generous padding
          and slightly bigger text so each card reads as a real CTA, not a
          chip. */}
      <ul
        ref={trackRef}
        className="flex gap-4 sm:gap-5 lg:gap-6 overflow-x-auto pb-2 snap-x snap-mandatory sm:px-14 lg:justify-center scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {pills.map((p) => (
          <li key={p.id} className="snap-start shrink-0">
            <a
              href={href}
              className="inline-flex items-center px-8 sm:px-10 lg:px-14 py-4 sm:py-5 rounded-full text-base sm:text-lg font-semibold transition hover:shadow-md"
              style={{
                backgroundColor: `${brand}26`,
                color: ink,
                border: `1px solid ${brand}55`,
              }}
            >
              {p.name}
            </a>
          </li>
        ))}
      </ul>

      {/* Next button */}
      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Next services"
        className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full items-center justify-center bg-white shadow-sm transition hover:shadow-md"
        style={{ border: `1px solid ${brand}66`, color: brand }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      <style>{`
        ul::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
