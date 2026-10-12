'use client'

import { useEffect } from 'react'
import {
  CHERRY_FLOATING_OFFSET_MOBILE,
  CHERRY_FLOATING_SECTION,
  CHERRY_FLOATING_Z_INDEX,
  CHERRY_FULL_PAGE_SECTIONS,
  CHERRY_WIDGET_SRC,
  cherryWidgetConfig,
  sunbitApplyUrl,
  type WidgetFonts,
} from '@/lib/financing-providers'
import { bottomBarOffset } from '@/lib/site-bottom-bar'

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

/**
 * Cherry's bottom-left mode hardcodes `z-index: 9999` in the widget's own
 * stylesheet and the config's zIndex only reaches the bottom-right mode, so
 * the pin goes in as an author `!important` rule — which beats the widget's
 * injected sheet. The class prefix is Cherry's own module name; the hash
 * after it changes per build, the prefix does not. Print hides the button:
 * a fixed "Pay over time" pill has no place on a printed page.
 */
/**
 * A blocked or unreachable widget.js (an ad blocker, a locked-down network,
 * Cherry down) would leave the page a padded white bar with nothing in it.
 * Cherry's loader mounts into the containers the moment its script runs, so
 * "every container still empty" is exactly "the script never ran" — and the
 * shell hides until then. The apply card below still carries the link.
 */
export const CHERRY_SHELL_CSS = `[data-cherry-shell]:has(#${CHERRY_FULL_PAGE_SECTIONS[0]}:empty){display:none}`

export const CHERRY_FLOATING_CSS =
  `[class*="floatingEstimator-floatingContainer"]{z-index:${CHERRY_FLOATING_Z_INDEX} !important}` +
  // Under `sm` the button lifts over the phone's bottom bar (the chat bubble
  // sits on the bar via the same `--site-bottom-bar` inset, and the button
  // sits above the bubble); the widget reads its offset from a variable it
  // sets inline on <html>, and an author !important rule outranks an inline
  // normal declaration.
  `@media (max-width:639px){:root{--custom-floating-estimator-offset-y:${bottomBarOffset(parseInt(CHERRY_FLOATING_OFFSET_MOBILE, 10))} !important}}` +
  `@media print{#${CHERRY_FLOATING_SECTION}{display:none !important}}`

export function CherryWidget({
  slug,
  name,
  brand,
  fonts,
  mode,
  aboveChat = false,
}: {
  slug: string
  name: string
  /** The clinic's CTA fill (`palette.brandStrong`) — Cherry paints white on it. */
  brand: string
  /** The template's real font names — the widget cannot take `inherit`. */
  fonts: WidgetFonts
  mode: 'page' | 'floating'
  /** Floating mode: the site's chat bubble is on, so sit above it. */
  aboveChat?: boolean
}) {
  useEffect(() => {
    const hw = ensureCherryLoader()
    const config = cherryWidgetConfig({
      slug,
      name,
      brandHex: brand,
      fontFamily: fonts.body,
      headerFontFamily: fonts.display,
      floating: mode === 'floating',
      aboveChat,
    })
    hw('init', config, mode === 'floating' ? [CHERRY_FLOATING_SECTION] : [...CHERRY_FULL_PAGE_SECTIONS])
  }, [slug, name, brand, fonts.body, fonts.display, mode, aboveChat])

  if (mode === 'floating') {
    return (
      <>
        <style>{CHERRY_FLOATING_CSS}</style>
        <div id={CHERRY_FLOATING_SECTION} data-testid="cherry-floating" />
      </>
    )
  }
  return (
    <div data-testid="cherry-widget" data-slug={slug}>
      <style>{CHERRY_SHELL_CSS}</style>
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
