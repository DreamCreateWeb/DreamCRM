import { useEffect, useState } from 'react'

/**
 * `window.matchMedia` as React state. Starts FALSE on the server and on the
 * first client render (so SSR and hydration agree), then tracks the query
 * from the first effect on. Defensive about environments with no
 * `matchMedia` (older happy-dom, a static render) — they read as "no match".
 *
 * The first consumer is the tenant sidebar: below `lg` it is an off-canvas
 * drawer, and the drawer's `inert` / focus-trap behaviour has to be gated on
 * the WIDTH rather than on the open flag alone, or the in-flow desktop
 * sidebar goes dead the moment the (never-opened) mobile flag reads false.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    if (!mq) return
    const update = () => setMatches(!!mq.matches)
    update()
    // `addEventListener` is the modern API; `addListener` the one Safari < 14
    // and some test doubles still ship. Either is enough.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    if (typeof mq.addListener === 'function') {
      mq.addListener(update)
      return () => mq.removeListener(update)
    }
    return undefined
  }, [query])

  return matches
}

/** Tailwind's `lg` breakpoint, from below: the widths where the sidebar is a drawer. */
export const BELOW_LG = '(max-width: 1023px)'
