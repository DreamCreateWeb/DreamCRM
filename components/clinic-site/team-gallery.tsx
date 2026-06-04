'use client'

import { useCallback, useRef } from 'react'

interface Member {
  id: string
  name: string
  title?: string | null
  photoUrl: string
}

interface Props {
  members: Member[]
  brand: string
  ink: string
  /** Soft surface colour the clay cards sit on/are moulded from. */
  surface: string
}

/**
 * Team-photo gallery slider with a soft "clay" (claymorphism) card treatment —
 * each member is a puffy rounded card with a dual light/dark shadow so it reads
 * as moulded out of the page rather than floating on it. Horizontal snap-scroll
 * with prev/next arrows, modelled on ServicePills. Photos come straight from the
 * clinic's staff records (clinic_profile.staff[].photoUrl) so there's a single
 * source of truth — editing the team in the Studio updates this gallery too.
 *
 * Client component only for the arrow scroll handlers; SSR paints the cards.
 */
export default function TeamGallery({ members, brand, ink, surface }: Props) {
  const trackRef = useRef<HTMLUListElement | null>(null)

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const step = Math.max(280, el.clientWidth * 0.6)
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }, [])

  if (members.length === 0) return null

  const arrowCls =
    'hidden sm:flex absolute top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full items-center justify-center bg-white shadow-sm transition hover:shadow-md'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Previous team members"
        className={`${arrowCls} left-0`}
        style={{ border: `1px solid ${brand}66`, color: brand }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      <ul
        ref={trackRef}
        className="flex gap-6 sm:gap-7 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory sm:px-14 lg:justify-center scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {members.map((m) => (
          <li key={m.id} className="snap-start shrink-0 w-[230px] sm:w-[248px]">
            <figure
              className="rounded-[30px] p-3.5 text-center transition hover:-translate-y-1"
              style={{
                backgroundColor: surface,
                boxShadow:
                  '13px 13px 30px rgba(28,26,23,0.14), -10px -10px 24px rgba(255,255,255,0.78)',
              }}
            >
              <div
                className="overflow-hidden rounded-[22px] aspect-[4/5] mb-3.5"
                style={{ backgroundColor: `${brand}1A` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.photoUrl}
                  alt={m.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <figcaption className="px-1 pb-1">
                <div className="font-semibold text-[15px] leading-tight" style={{ color: ink }}>
                  {m.name}
                </div>
                {m.title && (
                  <div className="text-[12.5px] mt-0.5 font-medium" style={{ color: brand }}>
                    {m.title}
                  </div>
                )}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Next team members"
        className={`${arrowCls} right-0`}
        style={{ border: `1px solid ${brand}66`, color: brand }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      <style>{`ul::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
