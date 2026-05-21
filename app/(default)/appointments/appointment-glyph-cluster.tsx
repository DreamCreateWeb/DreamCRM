import type { AppointmentRowFlags } from '@/lib/services/appointments'

/**
 * Per-row + per-drawer glyph cluster for the Appointments module. Carries
 * the patient-side glyphs (★/🎂/$/📝!/⚠️/🔕) plus three appointment-scoped
 * additions: ⏱ (reminder sent recently), 🆕 (booked just now), 📅
 * (rescheduled). Same cap + overflow rules as the Patients cluster.
 */
export function AppointmentGlyphCluster({
  flags,
  cap = 4,
  className = '',
}: {
  flags: AppointmentRowFlags
  cap?: number
  className?: string
}) {
  const glyphs: Array<{ key: string; symbol: string; color: string; label: string }> = []
  if (flags.newPatient) {
    glyphs.push({ key: 'new', symbol: '★', color: 'text-amber-500', label: 'New patient' })
  }
  if (flags.lapsedReturning) {
    glyphs.push({ key: 'lapsedReturning', symbol: '💤', color: 'text-emerald-600', label: 'Lapsed patient returning — celebrate' })
  }
  if (flags.birthdayThisWeek) {
    glyphs.push({ key: 'birthday', symbol: '🎂', color: '', label: 'Birthday this week' })
  }
  if (flags.hasOutstandingBalance) {
    glyphs.push({ key: 'balance', symbol: '$', color: 'text-red-500 font-bold', label: 'Outstanding balance' })
  }
  if (flags.missingIntakeBeforeAppt) {
    glyphs.push({ key: 'intake', symbol: '📝!', color: 'text-amber-500', label: 'Missing intake form before this visit' })
  }
  if (flags.unconfirmedNext48h) {
    glyphs.push({ key: 'unconfirmed', symbol: '⚠️', color: '', label: 'Unconfirmed appointment in next 48h' })
  }
  if (flags.bookedJustNow) {
    glyphs.push({ key: 'fresh', symbol: '🆕', color: 'text-violet-500', label: 'Booked in the last hour' })
  }
  if (flags.rescheduled) {
    glyphs.push({ key: 'resched', symbol: '📅', color: 'text-gray-500', label: 'Rescheduled from an earlier slot' })
  }
  if (flags.reminderSentRecently) {
    glyphs.push({ key: 'reminder', symbol: '⏱', color: 'text-gray-400', label: 'Reminder sent in the last 24h — avoid double-texting' })
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
        <span key={g.key} title={g.label} aria-label={g.label} className={`text-sm leading-none ${g.color}`}>
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
