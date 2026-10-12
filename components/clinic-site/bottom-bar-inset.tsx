'use client'

import { useEffect } from 'react'
import { BOTTOM_BAR_ATTR, BOTTOM_BAR_VAR } from '@/lib/site-bottom-bar'

/**
 * Measures the full-width bottom bar a template pins to the phone's bottom
 * edge (`data-site-bottom-bar`) and writes its height, as the distance from
 * the viewport's bottom to the bar's top, to `--site-bottom-bar` on <html>
 * — see lib/site-bottom-bar.ts. Re-measures on resize and on the bar's own
 * size changes; a hidden bar (`sm:hidden` above the breakpoint) measures 0.
 */
export default function BottomBarInset() {
  useEffect(() => {
    const root = document.documentElement
    const bars = () => Array.from(document.querySelectorAll<HTMLElement>(`[${BOTTOM_BAR_ATTR}]`))
    const measure = () => {
      let inset = 0
      for (const el of bars()) {
        if (getComputedStyle(el).display === 'none') continue
        const rect = el.getBoundingClientRect()
        if (rect.height === 0) continue
        inset = Math.max(inset, Math.round(window.innerHeight - rect.top))
      }
      root.style.setProperty(BOTTOM_BAR_VAR, `${Math.max(0, inset)}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    for (const el of bars()) ro?.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
      root.style.removeProperty(BOTTOM_BAR_VAR)
    }
  }, [])
  return null
}
