/**
 * SMS CONSENT — the words, and what makes them count.
 *
 * Two different legal standards live here, and conflating them is the
 * mistake this module exists to prevent:
 *
 *  - TRANSACTIONAL texts (an appointment reminder, a confirmation) ride the
 *    ordinary business relationship. A patient who gave the practice their
 *    mobile number to book a visit expects to hear about that visit.
 *  - MARKETING texts (recall, "we've got room Thursday", anything that is
 *    fundamentally an invitation to come back and spend money) need PRIOR
 *    EXPRESS WRITTEN CONSENT: a disclosure the patient actually saw, an
 *    affirmative act, and a record of both.
 *
 * Everything the machine sends under `outreach_campaign` and `schedule_gap`
 * is the second kind. So the checkbox is never pre-ticked, the disclosure is
 * rendered NEXT TO it rather than buried in a terms link, and the source of
 * every opt-in is recorded so the practice can answer "where did this
 * consent come from?" years later, which is the whole point of the record.
 *
 * Pure + client-safe: the public booking form renders this copy and the
 * server records against it, and they must be quoting the same sentence.
 */

/** Where an opt-in came from. Stored on `patient.marketing_opt_in_source` so
 *  a consent record can be traced back to the artifact that captured it. */
export type ConsentSource =
  /** The public booking form on the clinic's own site. */
  | 'booking'
  /** An intake form the patient filled in. */
  | 'intake'
  /** The patient portal's own preferences. */
  | 'portal'
  /** A staff member ticking it on the patient record, having been told. */
  | 'staff'
  /** The patient texted a keyword to the clinic's number. */
  | 'keyword'

export const CONSENT_SOURCES: readonly ConsentSource[] = [
  'booking',
  'intake',
  'portal',
  'staff',
  'keyword',
]

export function isConsentSource(v: unknown): v is ConsentSource {
  return typeof v === 'string' && (CONSENT_SOURCES as readonly string[]).includes(v)
}

/**
 * The disclosure, rendered beside the checkbox.
 *
 * Every clause is load-bearing and none of it is decoration:
 *  - it names the SENDER, because consent is given to a specific business;
 *  - it says what the texts are ABOUT, so "marketing" is not a surprise;
 *  - it says consent is NOT A CONDITION of booking or treatment, which is
 *    the clause that keeps the checkbox genuinely optional;
 *  - it gives the frequency and the rates caveat;
 *  - it names STOP and HELP, which is how a person gets out.
 *
 * Written to be read by a nervous person on a phone, not by a lawyer — the
 * house voice applies to compliance copy too.
 */
export function smsConsentDisclosure(clinicName: string): string {
  const who = clinicName.trim() || 'this practice'
  return `I agree to receive text messages from ${who} about appointments, openings and dental-health reminders. This isn’t required to book or to be seen. A few messages a month; message and data rates may apply. Reply STOP any time to stop, or HELP for help.`
}

/** The short label on the checkbox itself. The disclosure above carries the
 *  detail; this is what the eye lands on first. */
export const SMS_CONSENT_LABEL = 'Text me about appointments and openings'

/**
 * What the patient sees when they opt out, and what the carrier requires we
 * send back on STOP. One home, so the confirmation the practice believes was
 * sent is the one that actually was.
 */
export function smsStopConfirmation(clinicName: string): string {
  const who = clinicName.trim() || 'This practice'
  return `${who}: you're unsubscribed and won't get any more texts from us. Reply START to rejoin.`
}

export function smsHelpReply(clinicName: string, clinicPhone?: string | null): string {
  const who = clinicName.trim() || 'This practice'
  const call = clinicPhone?.trim() ? ` Call us at ${clinicPhone.trim()}.` : ''
  return `${who}: we send appointment reminders and occasional openings.${call} Reply STOP to unsubscribe.`
}

/**
 * The keywords a carrier requires be honoured, whatever else the message
 * says. Matched case-insensitively against the whole trimmed body — a
 * patient replying "stop please" or "STOP." means it, and treating that as
 * a normal message would be both rude and non-compliant.
 */
const STOP_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out']
const START_WORDS = ['start', 'unstop', 'yes', 'optin', 'opt in']
const HELP_WORDS = ['help', 'info']

export type InboundKeyword = 'stop' | 'start' | 'help' | null

/**
 * Classify an inbound text. Returns null for an ordinary message, which is
 * the common case and belongs in /messages like any other patient reply.
 *
 * Deliberately strict about what counts: only the keyword itself, optionally
 * with trailing punctuation or a single trailing word like "please". A
 * patient writing "I need to stop by after work" has not opted out, and
 * unsubscribing them would silently cut off their reminders.
 */
export function classifyInboundKeyword(body: string | null | undefined): InboundKeyword {
  if (!body) return null
  const cleaned = body
    .trim()
    .toLowerCase()
    .replace(/[.!,;:]+$/g, '')
    .replace(/\s+(please|now|thanks|thank you)$/i, '')
    .trim()
  if (STOP_WORDS.includes(cleaned)) return 'stop'
  if (START_WORDS.includes(cleaned)) return 'start'
  if (HELP_WORDS.includes(cleaned)) return 'help'
  return null
}
