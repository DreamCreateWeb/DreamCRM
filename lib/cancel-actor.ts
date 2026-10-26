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

/**
 * What cancelling a visit will TELL the patient — the three honest states
 * the drawer's confirm dialog can be in. `cancelAppointment` branches on
 * exactly these two facts (an email on file, then the clinic's cancellation
 * email switch), so the dialog derives from the same ones rather than
 * guessing. "The patient will not be notified automatically" was the old
 * copy, and it was false in the common case: the service emails them a
 * cancellation note with a rebook link whenever both facts hold.
 */
export type CancelNotice = 'email' | 'no_email' | 'email_off'

export function cancelNoticeFor(input: {
  patientEmail: string | null | undefined
  cancellationEmailOn: boolean
}): CancelNotice {
  // Order mirrors the service: no address means nothing goes out whatever
  // the switch says, so that is the fact worth naming first.
  if (!input.patientEmail?.trim()) return 'no_email'
  return input.cancellationEmailOn ? 'email' : 'email_off'
}

/** The dialog line for each state, naming the patient by first name. */
export function cancelNoticeMessage(notice: CancelNotice, patientFirstName: string): string {
  const first = patientFirstName.trim() || 'the patient'
  switch (notice) {
    case 'email':
      return `We’ll email ${first} that it’s cancelled, with a link to rebook.`
    case 'no_email':
      return `${first} has no email on file — nobody will be told automatically.`
    case 'email_off':
      return 'Your cancellation email is off, so nobody will be told automatically.'
  }
}
