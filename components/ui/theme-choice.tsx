'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/**
 * Light / Dark / Match device — the three-way theme choice for Settings →
 * Account, beside the text-size control.
 *
 * The header's one-tap toggle (`components/theme-toggle.tsx`) only ever sets
 * an explicit 'light' or 'dark', because a toggle has two states. That leaves
 * 'system' — follow the device — unreachable from the chrome once somebody
 * has flipped it by hand. This control is the door back. Per-device like the
 * text size: next-themes persists it in localStorage, and the root layout's
 * pre-paint script applies it before first paint.
 */
const OPTIONS: Array<{ value: 'light' | 'dark' | 'system'; label: string; sub: string }> = [
  { value: 'light', label: 'Light', sub: 'Morning sky' },
  { value: 'dark', label: 'Dark', sub: 'Dream at night' },
  { value: 'system', label: 'Match device', sub: 'Follow the device setting' },
]

export default function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  // next-themes reads the stored choice only on the client, so render every
  // option unselected until mounted — the same guard the text-size control
  // uses to keep SSR and hydration in agreement.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = theme ?? 'system'

  return (
    <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => {
        const active = mounted && current === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            aria-pressed={active}
            className={`rounded-[var(--r-md)] border px-3 py-3 text-center transition ${
              active
                ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600'
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
