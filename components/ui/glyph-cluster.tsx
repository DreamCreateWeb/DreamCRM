'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { GLYPHS, type GlyphId } from '@/lib/ui/encodings'

/**
 * Shared flag-glyph cluster — the one renderer for patient/appointment row
 * glyphs everywhere in the dashboard. Symbols, colors, and labels come from
 * the encodings registry, so rows and the <EncodingLegend> can never drift.
 *
 * Pairing shape + color so it works in greyscale / colorblind contexts.
 * Every glyph carries title + aria-label (the rule that triggered it) — AND
 * `role="img"` (2026-10-26): `aria-label` is prohibited on the generic role,
 * so on a bare span most screen readers skipped it and read the raw emoji
 * ("star", "memo exclamation mark"). The ProgressRing is the precedent.
 *
 * TOUCH HAS NO HOVER, so `title` never shows on a phone. The cluster is a
 * small button: a tap (or Enter) opens a tooltip listing every flag's label,
 * which closes on an outside tap, Escape, or a second tap. It stops the click
 * from reaching the row — rows are clickable list items, and this must never
 * become a row-level control (the clickable-rows contract) — and it is a
 * nested button inside a plain `<li>`, which that contract allows.
 *
 * Build the id list with patientFlagGlyphs()/appointmentFlagGlyphs() from
 * lib/ui/encodings, or pass explicit ids.
 */
export function GlyphCluster({
  glyphs,
  cap = 4,
  className = '',
}: {
  glyphs: GlyphId[]
  /** Max visible before "+N" overflow. Set to Infinity to render all. */
  cap?: number
  className?: string
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  // While the label panel is open: an outside tap or Escape closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (glyphs.length === 0) return null

  const defs = glyphs.map((id) => GLYPHS[id])
  const visible = defs.slice(0, cap)
  const overflow = defs.length - visible.length

  return (
    <span ref={rootRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="-m-1 inline-flex min-h-8 items-center gap-1.5 rounded-md p-1 hover:bg-ink-900/[0.04] dark:hover:bg-white/[0.06]"
      >
        {visible.map((g) => (
          <span key={g.id} role="img" title={g.label} aria-label={g.label} className={`text-sm leading-none ${g.className}`}>
            {g.symbol}
          </span>
        ))}
        {overflow > 0 && (
          <span
            role="img"
            aria-label={`${overflow} more flag${overflow === 1 ? '' : 's'}`}
            title={defs.slice(cap).map((g) => g.label).join(' · ')}
            className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
          >
            +{overflow}
          </span>
        )}
      </button>
      {open && (
        <span
          id={panelId}
          role="tooltip"
          className="pop-in absolute left-0 top-full z-30 mt-1 block min-w-[12rem] max-w-[18rem] rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] p-2 text-left font-normal shadow-[var(--shadow-pop)]"
        >
          {defs.map((g) => (
            <span key={g.id} className="flex items-start gap-2 py-0.5 text-xs leading-snug text-gray-700 dark:text-gray-200">
              <span aria-hidden="true" className={`shrink-0 ${g.className}`}>
                {g.symbol}
              </span>
              <span>{g.label}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
