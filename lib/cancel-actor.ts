/**
 * THE single home for "who cancelled this visit" phrasing (2026-07-22 —
 * the Maria/John mixup: a cancellation email went out and neither side could
 * tell who triggered it). Used by the patient timeline, the appointment
 * drawer, and anywhere else a cancelled visit explains itself.
 *
 * `via` values match appointment.cancelled_via:
 * 'staff' | 'portal' | 'reschedule' | 'waitlist_claim' | 'pms'.
 * Returns null for unknown/legacy rows (pre-actor-trail) — render nothing
 * rather than guess.
 */
export function cancelActorLabel(
  via: string | null | undefined,
  staffName?: string | null,
): string | null {
  switch (via) {
    case 'portal':
      return 'cancelled from the patient portal'
    case 'staff':
      return staffName ? `cancelled by ${staffName}` : 'cancelled by the office'
    case 'reschedule':
      return 'moved to a new time'
    case 'waitlist_claim':
      return 'moved up via the waitlist'
    case 'pms':
      return 'cancelled in the practice system'
    default:
      return null
  }
}
