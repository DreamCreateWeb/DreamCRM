/**
 * Design-system encodings — the single source of truth for every visual
 * encoding in the authenticated dashboard: semantic tones (color meanings),
 * flag glyphs, and time-based aging tiers.
 *
 * Client-safe (no server imports). Components render FROM this registry and
 * the <EncodingLegend> explains FROM this registry, so the UI and its legend
 * can never drift apart.
 *
 * See DESIGN-SYSTEM.md for the rules that govern these encodings.
 */

/* ------------------------------------------------------------------ */
/* Semantic tones                                                      */
/* ------------------------------------------------------------------ */

/**
 * The six semantic tones. One hue per meaning, everywhere:
 *
 * - ok      (emerald) healthy · done-good · confirmed · fresh
 * - warn    (amber)   needs OUR action · aging · unconfirmed · due
 * - urgent  (rose)    overdue · failed · problem — act now
 * - info    (violet)  in flight · ball in the patient's court · FYI
 * - special (fuchsia) new arrival · featured · celebrated
 * - neutral (gray)    archived · draft · n/a · terminal-neutral
 *
 * v3 change: the brand moved teal → dream blue, so `info` vacated indigo
 * (indistinguishable from a blue brand at pill size) for the periwinkle
 * violet ramp, and `special` moved violet → fuchsia (a pink "celebrate"
 * accent that suits new arrivals). The brand hue is NEVER a status —
 * identity only (primary, selection, focus, links, nav).
 */
export type Tone = 'ok' | 'warn' | 'urgent' | 'info' | 'special' | 'neutral'

/** Pill recipe per tone (status pills, badges). */
export const TONE_PILL: Record<Tone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  info: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  special: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  neutral: 'bg-gray-500/15 text-gray-600 dark:text-gray-300',
}

/** Inline text recipe per tone (trend hints, aging dates, deltas). */
export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  urgent: 'text-rose-700 dark:text-rose-300',
  info: 'text-violet-700 dark:text-violet-300',
  special: 'text-fuchsia-700 dark:text-fuchsia-300',
  neutral: 'text-gray-500 dark:text-gray-400',
}

/** Solid swatch per tone — for a small status DOT beside a label (e.g. the
 *  per-channel publish-status dots in Social Posts), where a full pill is too
 *  heavy. Keep the saturated 500 fill so a 6px dot stays legible. */
export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  urgent: 'bg-rose-500',
  info: 'bg-violet-500',
  special: 'bg-fuchsia-500',
  neutral: 'bg-gray-400',
}

/* ------------------------------------------------------------------ */
/* Flag glyphs                                                         */
/* ------------------------------------------------------------------ */

export type GlyphId =
  | 'newPatient'
  | 'birthday'
  | 'balance'
  | 'missingIntakeNext'
  | 'missingIntakeThis'
  | 'unconfirmed48h'
  | 'lapsed'
  | 'lapsedReturning'
  | 'optedOut'
  | 'bookedJustNow'
  | 'rescheduled'
  | 'reminderSent'

export interface GlyphDef {
  id: GlyphId
  symbol: string
  /** Short label — used as title + aria-label on the glyph itself. */
  label: string
  /** Legend copy: what it means AND what to do about it (actions-first). */
  description: string
  /** Color classes. Shape + color together so it survives greyscale. */
  className: string
}

/**
 * Canonical glyph registry. `label` strings are load-bearing — they are the
 * aria-labels tests and screen readers rely on. Change them only with the
 * matching test updates everywhere a glyph renders.
 */
export const GLYPHS: Record<GlyphId, GlyphDef> = {
  newPatient: {
    id: 'newPatient',
    symbol: '★',
    label: 'New patient',
    description: 'First visit ever, or joined in the last 30 days. Greet them by name — first impressions decide reviews.',
    className: 'text-amber-500',
  },
  birthday: {
    id: 'birthday',
    symbol: '🎂',
    label: 'Birthday this week',
    description: 'Their birthday falls within the week. A quick happy-birthday note goes a long way.',
    className: '',
  },
  balance: {
    id: 'balance',
    symbol: '$',
    label: 'Outstanding balance',
    description: 'They owe a balance. Mention it gently before their visit rather than surprising them at the desk.',
    className: 'text-rose-500 font-bold',
  },
  missingIntakeNext: {
    id: 'missingIntakeNext',
    symbol: '📝!',
    label: 'Missing intake form before next visit',
    description: 'No intake form on file and a visit is coming up. Send the form now so check-in is smooth.',
    className: 'text-amber-500',
  },
  missingIntakeThis: {
    id: 'missingIntakeThis',
    symbol: '📝!',
    label: 'Missing intake form before this visit',
    description: 'No intake form on file for this visit. Send the form now so check-in is smooth.',
    className: 'text-amber-500',
  },
  unconfirmed48h: {
    id: 'unconfirmed48h',
    symbol: '⚠️',
    label: 'Unconfirmed appointment in next 48h',
    description: 'A visit inside 48 hours has no confirmation. Send a reminder or call — unconfirmed slots are the ones that no-show.',
    className: '',
  },
  lapsed: {
    id: 'lapsed',
    symbol: '💤',
    label: 'Lapsed — no visit in 9+ months',
    description: 'No visit in 9+ months and nothing booked. A recall nudge can bring them back.',
    className: 'text-gray-400',
  },
  lapsedReturning: {
    id: 'lapsedReturning',
    symbol: '💤',
    label: 'Lapsed patient returning — celebrate',
    description: 'They were lapsed and booked again. Welcome them back warmly — no guilt about the gap.',
    className: 'text-emerald-600',
  },
  optedOut: {
    id: 'optedOut',
    symbol: '🔕',
    label: 'Opted out of marketing',
    description: 'They unsubscribed from marketing email. Transactional messages (confirmations, reminders) still send.',
    className: 'text-gray-400',
  },
  bookedJustNow: {
    id: 'bookedJustNow',
    symbol: '🆕',
    label: 'Booked in the last hour',
    description: 'This booking just landed. New bookings answered fast set the tone for the visit.',
    className: 'text-fuchsia-500',
  },
  rescheduled: {
    id: 'rescheduled',
    symbol: '📅',
    label: 'Rescheduled from an earlier slot',
    description: 'This visit was moved from an earlier time. The original slot was freed and stops reminding.',
    className: 'text-gray-500',
  },
  reminderSent: {
    id: 'reminderSent',
    symbol: '⏱',
    label: 'Reminder sent in the last 24h — avoid double-texting',
    description: 'A reminder already went out in the last 24 hours. Give them time to reply before nudging again.',
    className: 'text-gray-400',
  },
}

/** Structural flag shapes (match the derived row flags from lib/services). */
export interface PatientGlyphFlags {
  newPatient?: boolean
  birthdayThisWeek?: boolean
  hasOutstandingBalance?: boolean
  missingIntakeBeforeAppt?: boolean
  unconfirmedNext48h?: boolean
  lapsed?: boolean
  optedOut?: boolean
}

export interface AppointmentGlyphFlags extends PatientGlyphFlags {
  lapsedReturning?: boolean
  bookedJustNow?: boolean
  rescheduled?: boolean
  reminderSentRecently?: boolean
}

/** Patients-module glyph order (cap trims from the end). */
export function patientFlagGlyphs(flags: PatientGlyphFlags): GlyphId[] {
  const out: GlyphId[] = []
  if (flags.newPatient) out.push('newPatient')
  if (flags.birthdayThisWeek) out.push('birthday')
  if (flags.hasOutstandingBalance) out.push('balance')
  if (flags.missingIntakeBeforeAppt) out.push('missingIntakeNext')
  if (flags.unconfirmedNext48h) out.push('unconfirmed48h')
  if (flags.lapsed) out.push('lapsed')
  if (flags.optedOut) out.push('optedOut')
  return out
}

/** Appointments-module glyph order (cap trims from the end). */
export function appointmentFlagGlyphs(flags: AppointmentGlyphFlags): GlyphId[] {
  const out: GlyphId[] = []
  if (flags.newPatient) out.push('newPatient')
  if (flags.lapsedReturning) out.push('lapsedReturning')
  if (flags.birthdayThisWeek) out.push('birthday')
  if (flags.hasOutstandingBalance) out.push('balance')
  if (flags.missingIntakeBeforeAppt) out.push('missingIntakeThis')
  if (flags.unconfirmedNext48h) out.push('unconfirmed48h')
  if (flags.bookedJustNow) out.push('bookedJustNow')
  if (flags.rescheduled) out.push('rescheduled')
  if (flags.reminderSentRecently) out.push('reminderSent')
  if (flags.optedOut) out.push('optedOut')
  return out
}

/* ------------------------------------------------------------------ */
/* Aging tiers (the green → amber → red "rotting" vocabulary)          */
/* ------------------------------------------------------------------ */

export type AgingTierId = 'fresh' | 'quiet' | 'aging' | 'late' | 'overdue'

export interface AgingTierDef {
  id: AgingTierId
  label: string
  /** Left-border class for list rows. */
  borderClass: string
  /** Small swatch class for the legend. */
  swatchClass: string
}

export const AGING_TIERS: Record<AgingTierId, AgingTierDef> = {
  fresh: {
    id: 'fresh',
    label: 'Fresh',
    borderClass: 'border-l-emerald-400',
    swatchClass: 'bg-emerald-400',
  },
  quiet: {
    id: 'quiet',
    label: 'Quiet',
    borderClass: 'border-l-stone-300 dark:border-l-stone-600',
    swatchClass: 'bg-stone-300 dark:bg-stone-600',
  },
  aging: {
    id: 'aging',
    label: 'Aging',
    borderClass: 'border-l-amber-400',
    swatchClass: 'bg-amber-400',
  },
  late: {
    id: 'late',
    label: 'Late',
    borderClass: 'border-l-amber-600',
    swatchClass: 'bg-amber-600',
  },
  overdue: {
    id: 'overdue',
    label: 'Overdue',
    borderClass: 'border-l-rose-600',
    swatchClass: 'bg-rose-600',
  },
}

export const AGING_BORDER_NONE = 'border-l-transparent'

/** Border class for a tier (or transparent when no tier applies). */
export function agingBorderClass(tier: AgingTierId | null): string {
  return tier ? AGING_TIERS[tier].borderClass : AGING_BORDER_NONE
}

/**
 * Leads rot: hours SINCE the lead arrived, while still status 'new'.
 * Mirrors the thresholds the Leads module has always used.
 */
export function leadAgingTier(ageHours: number): AgingTierId {
  if (ageHours <= 1) return 'fresh'
  if (ageHours <= 4) return 'quiet'
  if (ageHours <= 24) return 'aging'
  if (ageHours <= 72) return 'late'
  return 'overdue'
}

/**
 * Messages rot: hours an inbound thread has waited without a reply.
 * Mirrors the unified-inbox thresholds (fresh < 4h, amber < 24h, rose after).
 */
export function messageRotTier(waitingHours: number): AgingTierId {
  if (waitingHours < 4) return 'fresh'
  if (waitingHours < 24) return 'aging'
  return 'overdue'
}

/**
 * Appointments urgency: maps the appointment service's AgingLevel
 * ('none' | 'neutral' | 'amber' | 'darkAmber' | 'red' — hours UNTIL an
 * unconfirmed visit) onto the shared tier vocabulary.
 */
export const APPOINTMENT_AGING_TIER: Record<string, AgingTierId | null> = {
  none: null,
  neutral: 'quiet',
  amber: 'aging',
  darkAmber: 'late',
  red: 'overdue',
}

/* ------------------------------------------------------------------ */
/* Aging legend presets (per-module wording for the same colors)       */
/* ------------------------------------------------------------------ */

export interface AgingLegendRow {
  tier: AgingTierId
  meaning: string
}

export interface AgingLegendPreset {
  /** One-line explanation of what the colored left edge measures. */
  title: string
  rows: AgingLegendRow[]
}

export const AGING_LEGENDS = {
  leads: {
    title: 'The colored left edge shows how long a new lead has waited for a first call.',
    rows: [
      { tier: 'fresh', meaning: 'Under 1 hour — call now, conversion is highest' },
      { tier: 'quiet', meaning: '1–4 hours old' },
      { tier: 'aging', meaning: '4–24 hours — getting cold' },
      { tier: 'late', meaning: '1–3 days — likely shopping around' },
      { tier: 'overdue', meaning: 'Over 3 days without contact' },
    ],
  },
  appointments: {
    title: 'The colored left edge shows how close an unconfirmed visit is.',
    rows: [
      { tier: 'quiet', meaning: '2–3 days out, still unconfirmed' },
      { tier: 'aging', meaning: 'Within 48 hours, unconfirmed — send a reminder' },
      { tier: 'late', meaning: 'Within 24 hours, unconfirmed' },
      { tier: 'overdue', meaning: 'Within 12 hours, unconfirmed — call them' },
    ],
  },
  messages: {
    title: 'The colored left edge shows how long a patient has waited for a reply.',
    rows: [
      { tier: 'fresh', meaning: 'Replied to, or waiting under 4 hours' },
      { tier: 'aging', meaning: 'Waiting 4–24 hours' },
      { tier: 'overdue', meaning: 'Waiting over a day — answer this first' },
    ],
  },
  applicants: {
    title: 'The colored left edge shows how long an applicant has waited unreviewed.',
    rows: [
      { tier: 'fresh', meaning: 'Applied in the last day' },
      { tier: 'aging', meaning: 'Waiting a few days' },
      { tier: 'overdue', meaning: 'Waiting over a week — good candidates move fast' },
    ],
  },
} as const satisfies Record<string, AgingLegendPreset>

export type AgingLegendId = keyof typeof AGING_LEGENDS

/* ------------------------------------------------------------------ */
/* Status-pill legend rows (module pages pass their own meanings)      */
/* ------------------------------------------------------------------ */

export interface PillLegendRow {
  tone: Tone
  label: string
  meaning: string
}
