'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Container-width measurement for charts — deliberately NOT Recharts'
 * ResponsiveContainer, which renders nothing until it has measured: that
 * means an EMPTY server render (a layout pop on every page load) and an
 * empty chart under the test DOM. This hook renders at `fallback` first
 * (SSR + first paint + happy-dom) and corrects to the real container width
 * on mount / resize.
 */
export function useMeasuredWidth<T extends HTMLElement>(
  fallback: number,
): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  return [ref, width]
}
