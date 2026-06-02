'use client'

import {
  createElement,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

// useLayoutEffect logs a warning on the server; use useEffect there. The hook
// itself never runs on the server anyway (we use `typeof window !== 'undefined'`
// inside it), but the warning is noisy.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface Props {
  children: ReactNode
  /** Stagger delay in ms. Used to chain reveals on adjacent items. */
  delay?: number
  /** Vertical offset (px) for the initial hidden state. */
  yOffset?: number
  /** Threshold for IntersectionObserver fire. */
  threshold?: number
  className?: string
  style?: CSSProperties
  /** Element tag to render. Defaults to div. */
  as?: 'div' | 'section' | 'li' | 'article' | 'span'
}

/**
 * Reveal children with a fade + small translate-y on scroll into view.
 *
 * Crucial UX detail: the SSR HTML renders the children with NO opacity/
 * transform style — so above-the-fold content is fully visible at first paint
 * (no flash). On mount we measure the element; if it's already in the viewport
 * we leave it static (no animation), otherwise we hide it and observe for
 * scroll-in. Result: heroes feel instant; lower sections animate in.
 *
 * Respects `prefers-reduced-motion` + degrades to "always visible" when
 * IntersectionObserver isn't available.
 */
export default function ScrollReveal({
  children,
  delay = 0,
  yOffset = 24,
  threshold = 0.12,
  className,
  style,
  as = 'div',
}: Props) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  // 'static' = no transform/opacity overrides (SSR + above-fold + reduced-motion)
  // 'pre'    = hidden, waiting for intersection
  // 'reveal' = animating to visible
  const [phase, setPhase] = useState<'static' | 'pre' | 'reveal'>('static')

  useIsoLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof IntersectionObserver === 'undefined') return
    if (!node) return

    // Already in viewport → leave it static. Above-the-fold content stays
    // crisp without an entrance animation. The 80px bias picks up content
    // that's just barely below the fold but will be visible after the first
    // scroll input.
    const rect = node.getBoundingClientRect()
    const initiallyInView = rect.top < window.innerHeight - 80 && rect.bottom > 0
    if (initiallyInView) return

    setPhase('pre')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPhase('reveal')
            observer.disconnect()
            break
          }
        }
      },
      { threshold, rootMargin: '0px 0px -60px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, threshold])

  let composedStyle: CSSProperties
  if (phase === 'static') {
    composedStyle = { ...style }
  } else if (phase === 'pre') {
    composedStyle = {
      opacity: 0,
      transform: `translate3d(0, ${yOffset}px, 0)`,
      transition: 'none',
      willChange: 'opacity, transform',
      ...style,
    }
  } else {
    composedStyle = {
      opacity: 1,
      transform: 'translate3d(0, 0, 0)',
      transition: `opacity 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
      willChange: 'auto',
      ...style,
    }
  }

  return createElement(
    as,
    { ref: setNode, className, style: composedStyle },
    children,
  )
}
