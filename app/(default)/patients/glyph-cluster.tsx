import type { PatientRowFlags } from '@/lib/services/patients'

/**
 * Shared per-row + per-header glyph cluster. Pairing shape + color so it
 * works in greyscale / colorblind contexts. The label on each <span> is
 * the rule that triggered the glyph (read aloud by screen readers).
 */
export function GlyphCluster({
  flags,
  cap = 4,
  className = '',
}: {
  flags: PatientRowFlags
  /** Max visible before "+N" overflow. Set to Infinity to render all. */
  cap?: number
  className?: string
}) {
  const glyphs: Array<{ key: string; symbol: string; color: string; label: string }> = []
  if (flags.newPatient) {
    glyphs.push({ key: 'new', symbol: '★', color: 'text-amber-500', label: 'New patient' })
  }
  if (flags.birthdayThisWeek) {
    glyphs.push({ key: 'birthday', symbol: '🎂', color: '', label: 'Birthday this week' })
  }
  if (flags.hasOutstandingBalance) {
    glyphs.push({ key: 'balance', symbol: '$', color: 'text-red-500 font-bold', label: 'Outstanding balance' })
  }
  if (flags.missingIntakeBeforeAppt) {
    glyphs.push({ key: 'intake', symbol: '📝!', color: 'text-amber-500', label: 'Missing intake form before next visit' })
  }
  if (flags.unconfirmedNext48h) {
    glyphs.push({ key: 'unconfirmed', symbol: '⚠️', color: '', label: 'Unconfirmed appointment in next 48h' })
  }
  if (flags.lapsed) {
    glyphs.push({ key: 'lapsed', symbol: '💤', color: 'text-gray-400', label: 'Lapsed — no visit in 9+ months' })
  }
  if (flags.optedOut) {
    glyphs.push({ key: 'optedout', symbol: '🔕', color: 'text-gray-400', label: 'Opted out of marketing' })
  }

  if (glyphs.length === 0) return null

  const visible = glyphs.slice(0, cap)
  const overflow = glyphs.length - visible.length

  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`}>
      {visible.map((g) => (
        <span
          key={g.key}
          title={g.label}
          aria-label={g.label}
          className={`text-sm leading-none ${g.color}`}
        >
          {g.symbol}
        </span>
      ))}
      {overflow > 0 && (
        <span
          aria-label={`${overflow} more flag${overflow === 1 ? '' : 's'}`}
          title={glyphs.slice(cap).map((g) => g.label).join(' · ')}
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}
