import { GLYPHS, type GlyphId } from '@/lib/ui/encodings'

/**
 * Shared flag-glyph cluster — the one renderer for patient/appointment row
 * glyphs everywhere in the dashboard. Symbols, colors, and labels come from
 * the encodings registry, so rows and the <EncodingLegend> can never drift.
 *
 * Pairing shape + color so it works in greyscale / colorblind contexts.
 * Every glyph carries title + aria-label (the rule that triggered it).
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
  if (glyphs.length === 0) return null

  const defs = glyphs.map((id) => GLYPHS[id])
  const visible = defs.slice(0, cap)
  const overflow = defs.length - visible.length

  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`}>
      {visible.map((g) => (
        <span key={g.id} title={g.label} aria-label={g.label} className={`text-sm leading-none ${g.className}`}>
          {g.symbol}
        </span>
      ))}
      {overflow > 0 && (
        <span
          aria-label={`${overflow} more flag${overflow === 1 ? '' : 's'}`}
          title={defs.slice(cap).map((g) => g.label).join(' · ')}
          className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}
