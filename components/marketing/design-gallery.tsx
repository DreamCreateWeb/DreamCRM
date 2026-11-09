'use client'

import { useEffect, useRef, useState } from 'react'
import { DAY_WIRE, MONO_LABEL } from './ui'

/**
 * THE MARKETING DESIGN GALLERY: every site design as a live, inert, scaled
 * frame of the demo practice. Same recipe as the dashboard's template gallery
 * (`/site/<slug>/tf/<id>`, a fixed desktop-width frame scaled by a
 * ResizeObserver, hidden until first measured), minus anything you can press.
 */
export interface MarketingDesign {
  id: string
  label: string
  bestFor: string
  swatches: Array<{ name: string; hex: string }>
}

const FRAME_W = 1360
const FRAME_H = 850
const DEMO_SLUG = 'acme-dental-demo'

export function DesignGallery({ designs }: { designs: MarketingDesign[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {designs.map((d) => (
        <li key={d.id}>
          <DesignCard design={d} />
        </li>
      ))}
    </ul>
  )
}

function DesignCard({ design }: { design: MarketingDesign }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState<number | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0) setScale(el.clientWidth / FRAME_W)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <figure
      className="overflow-hidden rounded-[14px] border bg-white"
      style={{ borderColor: DAY_WIRE }}
    >
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden border-b bg-gray-100"
        style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}`, borderColor: DAY_WIRE }}
      >
        <iframe
          src={`/site/${DEMO_SLUG}/tf/${design.id}`}
          title={`${design.label} design, live on the demo practice`}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          className="absolute left-0 top-0 select-none border-0 bg-white pointer-events-none"
          style={{
            width: FRAME_W,
            height: FRAME_H,
            transform: `scale(${scale ?? 0})`,
            transformOrigin: 'top left',
            visibility: scale === null ? 'hidden' : undefined,
          }}
        />
      </div>
      <figcaption className="p-4">
        <h3 className="text-[1rem] font-bold text-gray-950">{design.label}</h3>
        <p className="mt-1 text-[0.85rem] leading-relaxed text-gray-600">{design.bestFor}</p>
        <ul className={`mt-3 flex flex-wrap gap-x-4 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          {design.swatches.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full border"
                style={{ backgroundColor: s.hex, borderColor: DAY_WIRE }}
                aria-hidden="true"
              />
              {s.name} {s.hex}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}
