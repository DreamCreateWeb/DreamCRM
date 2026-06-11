'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AGING_LEGENDS,
  AGING_TIERS,
  GLYPHS,
  TONE_PILL,
  type AgingLegendId,
  type GlyphId,
  type PillLegendRow,
} from '@/lib/ui/encodings'

/**
 * "Key" affordance — the in-context legend that explains every visual
 * encoding a page uses (flag glyphs, aging left-edge colors, status pills).
 *
 * DESIGN-SYSTEM.md rule: any page that renders glyphs, aging borders, or
 * color-coded pills MUST mount this in its PageHeader. Content comes from
 * the encodings registry, so the legend can never drift from the UI.
 */
export function EncodingLegend({
  glyphs = [],
  aging,
  pills = [],
  label = 'Key',
  align = 'right',
  className = '',
}: {
  /** Which flag glyphs this page renders (registry ids, in display order). */
  glyphs?: GlyphId[]
  /** Aging legend preset, when the page uses colored left edges. */
  aging?: AgingLegendId
  /** Status-pill meanings, when the page color-codes statuses. */
  pills?: PillLegendRow[]
  label?: string
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const agingPreset = aging ? AGING_LEGENDS[aging] : null
  if (glyphs.length === 0 && !agingPreset && pills.length === 0) return null

  return (
    <span ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300 gap-1.5"
        title="What the colors and icons on this page mean"
      >
        <svg className="shrink-0 fill-current text-gray-400 dark:text-gray-500" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-3.5a1 1 0 0 1-2 0V5a1 1 0 0 1 2 0v3.5Z" />
        </svg>
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="What the colors and icons mean"
          className={`absolute top-full mt-2 z-30 w-80 max-h-[70vh] overflow-y-auto rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] shadow-[var(--shadow-pop)] p-4 text-left ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
            What the marks on this page mean
          </div>

          {glyphs.length > 0 && (
            <div className="mb-4 last:mb-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Icons
              </div>
              <ul className="space-y-2.5">
                {glyphs.map((id) => {
                  const g = GLYPHS[id]
                  return (
                    <li key={id} className="flex items-start gap-2.5">
                      <span className={`w-6 shrink-0 text-center text-sm leading-5 ${g.className}`} aria-hidden="true">
                        {g.symbol}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{g.label}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{g.description}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {agingPreset && (
            <div className="mb-4 last:mb-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Timing colors
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{agingPreset.title}</p>
              <ul className="space-y-2">
                {agingPreset.rows.map((row) => {
                  const tier = AGING_TIERS[row.tier]
                  return (
                    <li key={row.tier} className="flex items-start gap-2.5">
                      <span className={`mt-1 h-2.5 w-6 shrink-0 rounded-full ${tier.swatchClass}`} aria-hidden="true" />
                      <span className="min-w-0 text-xs text-gray-600 dark:text-gray-300">
                        <span className="font-medium text-gray-800 dark:text-gray-100">{tier.label}</span> — {row.meaning}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {pills.length > 0 && (
            <div className="mb-4 last:mb-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Statuses
              </div>
              <ul className="space-y-2">
                {pills.map((row) => (
                  <li key={row.label} className="flex items-start gap-2.5">
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_PILL[row.tone]}`}
                    >
                      {row.label}
                    </span>
                    <span className="min-w-0 text-xs text-gray-500 dark:text-gray-400 pt-0.5">{row.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
