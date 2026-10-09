'use client'

import { useEffect } from 'react'
import {
  CHERRY_FLOATING_SECTION,
  CHERRY_FULL_PAGE_SECTIONS,
  CHERRY_WIDGET_SRC,
  cherryWidgetConfig,
  sunbitApplyUrl,
} from '@/lib/financing-providers'

/**
 * The financing providers' embeds, built by the site from a validated slug
 * — never from pasted HTML (lib/financing-providers.ts).
 *
 * CHERRY ships one script (`widget.js`) with a queueing loader: `_hw` is a
 * function that collects calls until the script lands, then the script
 * drains the queue. Their generator emits the loader inline; this component
 * is that loader, with the clinic's brand in place of the generator's
 * colour picker. Two modes: the full-page widget (hero · calculator · how
 * it works · FAQ) on the financing page, and the floating "Pay over time"
 * button the layout paints on every page. The script is loaded once per
 * document and the init is queued per mount.
 */

type HwFn = ((...args: unknown[]) => void) & { q?: unknown[][] }

declare global {
  interface Window {
    _hw?: HwFn
  }
}

function ensureCherryLoader(): HwFn {
  if (!window._hw) {
    const q: unknown[][] = []
    const fn = ((...args: unknown[]) => {
      q.push(args)
    }) as HwFn
    fn.q = q
    window._hw = fn
  }
  if (!document.getElementById('_hw')) {
    const js = document.createElement('script')
    js.id = '_hw'
    js.src = CHERRY_WIDGET_SRC
    js.async = true
    document.head.appendChild(js)
  }
  return window._hw
}

export function CherryWidget({
  slug,
  name,
  brand,
  mode,
}: {
  slug: string
  name: string
  /** The clinic's brand hex — Cherry's primary colour. */
  brand: string
  mode: 'page' | 'floating'
}) {
  useEffect(() => {
    const hw = ensureCherryLoader()
    const config = cherryWidgetConfig({ slug, name, brandHex: brand, fontFamily: 'inherit', floating: mode === 'floating' })
    hw('init', config, mode === 'floating' ? [CHERRY_FLOATING_SECTION] : [...CHERRY_FULL_PAGE_SECTIONS])
  }, [slug, name, brand, mode])

  if (mode === 'floating') return <div id={CHERRY_FLOATING_SECTION} data-testid="cherry-floating" />
  return (
    <div data-testid="cherry-widget" data-slug={slug}>
      {CHERRY_FULL_PAGE_SECTIONS.map((id) => (
        <div key={id} id={id} />
      ))}
    </div>
  )
}

/** Sunbit's pre-qualification page, framed the way their own website template does. */
export function SunbitPrequalify({ slug, name }: { slug: string; name: string }) {
  return (
    <iframe
      src={sunbitApplyUrl(slug)}
      title={`Sunbit — smile now, pay over time at ${name}`}
      className="w-full rounded-2xl"
      style={{ border: 0, overflow: 'hidden', height: 1080 }}
      loading="lazy"
      data-testid="sunbit-widget"
    />
  )
}
