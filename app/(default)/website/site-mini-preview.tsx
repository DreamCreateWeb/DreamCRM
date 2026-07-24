'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The hub hero's live site preview — the clinic's OWN homepage, rendered in
 * a little browser frame. Same mechanics as the templates gallery: a
 * fixed-width iframe of the side-effect-free /site/[slug]/tf/[template]
 * frame (no beacon, no chat bubble, no banners — a hub visit must never
 * count as a site visit), CSS-scaled to the card and inert (no scroll, no
 * clicks, no focus). The whole frame links out to the real live site.
 */

const FRAME_W = 1360
const FRAME_H = 850

export default function SiteMiniPreview({
  slug,
  template,
  siteUrl,
  host,
}: {
  slug: string
  template: string
  siteUrl: string
  host: string
}) {
  // Measure the wrapper → derive the scale. ResizeObserver keeps it right
  // through sidebar collapses; the frame stays hidden until the first real
  // measurement so there's no flash of a mis-scaled site.
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
    <a
      href={siteUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`View your live site at ${host} (opens in a new tab)`}
      className="group/preview block bg-[color:var(--color-surface-sunk)] lg:border-r border-b lg:border-b-0 border-[color:var(--color-hairline)]"
    >
      {/* Browser chrome — dots + the address pill. */}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-300 dark:bg-rose-400/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300 dark:bg-amber-400/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 dark:bg-emerald-400/60" />
        </span>
        <span className="flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          <span aria-hidden="true" className="text-emerald-500">🔒</span>
          <span className="truncate">{host}</span>
        </span>
        <span
          aria-hidden="true"
          className="text-xs font-medium text-gray-400 dark:text-gray-500 group-hover/preview:text-teal-700 dark:group-hover/preview:text-teal-300 transition-colors"
        >
          ↗
        </span>
      </div>
      {/* The living page, scaled down and inert. */}
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-white"
        style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
      >
        <iframe
          src={`/site/${slug}/tf/${template}`}
          title="A live preview of your website"
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          className="absolute top-0 left-0 border-0 bg-white pointer-events-none select-none"
          style={{
            width: FRAME_W,
            height: FRAME_H,
            transform: `scale(${scale ?? 0})`,
            transformOrigin: 'top left',
            visibility: scale === null ? 'hidden' : undefined,
          }}
        />
      </div>
    </a>
  )
}
