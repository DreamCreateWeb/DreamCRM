'use client'

import { useEffect, useState } from 'react'

export type TextSize = 'std' | 'lg' | 'xl'

const OPTIONS: Array<{ value: TextSize; label: string; sub: string }> = [
  { value: 'std', label: 'Standard', sub: 'The default' },
  { value: 'lg', label: 'Large', sub: '~12% bigger' },
  { value: 'xl', label: 'Extra large', sub: '~25% bigger' },
]

function readCurrent(): TextSize {
  try {
    const s = window.localStorage.getItem('dc-text-size')
    return s === 'lg' || s === 'xl' ? s : 'std'
  } catch {
    return 'std'
  }
}

/** Apply + persist — the same class the root layout's pre-paint script sets. */
export function applyTextSize(size: TextSize) {
  const el = document.documentElement
  el.classList.remove('dc-text-lg', 'dc-text-xl')
  if (size !== 'std') el.classList.add(`dc-text-${size}`)
  try {
    if (size === 'std') window.localStorage.removeItem('dc-text-size')
    else window.localStorage.setItem('dc-text-size', size)
  } catch {
    /* private mode — the class still applies for this session */
  }
}

/**
 * The "never squint" control — scales the ROOT font size so the whole app
 * grows proportionally (Tailwind's scale is rem-based). Applies instantly,
 * persists per device (vision needs follow the person's screen, not their
 * account), and the root layout re-applies it before paint on every load.
 * `tone` picks the styling family: the v2 dashboard or the warm portal.
 */
export default function TextSizeToggle({ tone = 'dashboard', brand }: { tone?: 'dashboard' | 'portal'; brand?: string }) {
  const [size, setSize] = useState<TextSize>('std')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setSize(readCurrent())
    setMounted(true)
  }, [])

  function pick(next: TextSize) {
    setSize(next)
    applyTextSize(next)
  }

  const accent = tone === 'portal' ? (brand ?? '#9CAF9F') : undefined

  return (
    <div role="group" aria-label="Text size" className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => {
        const active = mounted && size === o.value
        if (tone === 'portal') {
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              aria-pressed={active}
              className="rounded-2xl px-3 py-3 text-center transition"
              style={
                active
                  ? { backgroundColor: accent, color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', color: '#1C1A17', border: '1px solid #E8E2D9' }
              }
            >
              <span className="block text-[0.95rem] font-semibold leading-tight">{o.label}</span>
              <span
                className="mt-0.5 block text-[0.78rem]"
                style={{ color: active ? 'rgba(255,255,255,0.85)' : '#6B635A' }}
              >
                {o.sub}
              </span>
            </button>
          )
        }
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            aria-pressed={active}
            className={`rounded-[var(--r-md)] px-3 py-3 text-center border transition ${
              active
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className="block text-sm font-semibold leading-tight">{o.label}</span>
            <span className={`mt-0.5 block text-xs ${active ? 'text-teal-700 dark:text-teal-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {o.sub}
            </span>
          </button>
        )
      })}
    </div>
  )
}
