/**
 * THE HUDDLE — the pure half (docs/daily-tools.md, slice H1).
 *
 * The team's morning meeting, already prepared: how the last working day
 * went, today patient by patient, the next day on the books, and the few
 * things waiting on the team. This file is client-safe and pure — the view
 * model the page renders, and every sentence in it. The server half
 * (lib/services/huddle.ts) does the reads and hands the facts here.
 *
 * THREE LAWS, each with a reason the research gave (docs/daily-tools.md):
 *
 *  1. RULES, NEVER THE AI. Every row is assembled from columns by the code
 *     below. Patient rows never reach a model — the same privacy line the
 *     Dream Team's chat holds.
 *  2. SAY WHERE IT CAME FROM. Teams stop trusting a huddle the day one of
 *     its numbers disagrees with their practice software, so the page names
 *     its source and how old the sync is, and it states only what this app
 *     holds first-hand. No production figures, no goals, no scoreboards.
 *  3. NO RANKINGS. Nothing here compares one person with another. In a team
 *     of eight a leaderboard is personal.
 *
 * The flags are NOT defined here: they are the per-patient audit's
 * (lib/services/patient-audit.ts), the same rules My Day and the morning
 * email read for tomorrow. This file only decides how a flag is toned and
 * what it says when the screen is somewhere a patient could read it.
 */

import type { Tone } from '@/lib/ui/encodings'
import { describeWork } from '@/lib/morning-after'
import { PMS_DOOR, type PmsLink } from '@/lib/pms-link'
import { formatClosureRange, type ClosureRange } from '@/lib/closures'

// ── Flags ────────────────────────────────────────────────────────────

/** The audit's flag keys (lib/services/patient-audit.ts `AuditFlag`). Kept
 *  structural so this file imports nothing server-only; the service's call
 *  into `toFlagView` is where TypeScript holds the two lists together. */
export type HuddleFlagKey =
  | 'unconfirmed'
  | 'no_intake'
  | 'balance'
  | 'unreachable'
  | 'new_patient'
  | 'lapsed_returning'
  | 'deposit_pending'
  | 'birthday'
  | 'insurance_stale'
  | 'medical_alert'

export interface HuddleFlagInput {
  key: HuddleFlagKey
  label: string
  href?: string
}

export interface HuddleFlagView {
  key: HuddleFlagKey
  tone: Tone
  label: string
  /** The same flag with amounts and medical detail left out — what shows
   *  while "Hide details" is on. */
  quiet: string
  href?: string
}

/**
 * A flag's tone, by the encoding contract (DESIGN-SYSTEM.md Part 1):
 * `special` = a new arrival or something to celebrate; `warn` = prep that is
 * OURS to do before they sit down. Never the brand hue, never a ranking.
 */
const FLAG_TONE: Record<HuddleFlagKey, Tone> = {
  new_patient: 'special',
  lapsed_returning: 'special',
  birthday: 'special',
  medical_alert: 'warn',
  unconfirmed: 'warn',
  no_intake: 'warn',
  insurance_stale: 'warn',
  balance: 'warn',
  deposit_pending: 'warn',
  unreachable: 'warn',
}

export function flagTone(key: HuddleFlagKey): Tone {
  return FLAG_TONE[key]
}

/**
 * What a flag says on a screen a patient might see. Only three flags carry
 * something private in their words (a dollar amount, a medical detail); the
 * rest already say nothing a waiting room should not read.
 */
const QUIET_LABEL: Partial<Record<HuddleFlagKey, string>> = {
  medical_alert: 'Heads-up on their intake form',
  balance: 'A balance worth settling at the visit',
  deposit_pending: 'Booking deposit not completed',
}

export function toFlagView(flag: HuddleFlagInput): HuddleFlagView {
  return {
    key: flag.key,
    tone: flagTone(flag.key),
    label: flag.label,
    quiet: QUIET_LABEL[flag.key] ?? flag.label,
    ...(flag.href ? { href: flag.href } : {}),
  }
}

// ── Visits ───────────────────────────────────────────────────────────

/** Where a visit stands, as the Huddle cares: still ahead, done, or missed. */
export type HuddleVisitState = 'ahead' | 'done' | 'no_show'

export function visitState(status: string): HuddleVisitState {
  if (status === 'completed') return 'done'
  if (status === 'no_show') return 'no_show'
  return 'ahead'
}

export interface HuddleVisitView {
  id: string
  patientId: string
  name: string
  /** "Maria R." — what shows while "Hide details" is on. */
  shortName: string
  /** Clinic-local wall-clock, formatted on the server ("9:00 AM"). */
  time: string
  /** "New patient exam" */
  type: string
  provider: string | null
  state: HuddleVisitState
  flags: HuddleFlagView[]
}

/** "Maria Ramirez" → "Maria R."; a single name stays as it is. */
export function shortPatientName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] ?? ''
  const last = parts[parts.length - 1]
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`
}

/** A visit-type id as words: `new_patient_exam` → "New patient exam". */
export function visitTypeLabel(type: string): string {
  const words = (type ?? '').replace(/_/g, ' ').trim()
  if (!words) return 'Visit'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// ── The day's tally ──────────────────────────────────────────────────

export interface HuddleTally {
  key: HuddleFlagKey
  tone: Tone
  text: string
}

/** The order a team would say them in: who is special first, then the prep. */
const TALLY_ORDER: readonly HuddleFlagKey[] = [
  'new_patient',
  'lapsed_returning',
  'birthday',
  'medical_alert',
  'unconfirmed',
  'no_intake',
  'insurance_stale',
  'balance',
  'deposit_pending',
  'unreachable',
]

const TALLY_TEXT: Record<HuddleFlagKey, (n: number) => string> = {
  new_patient: (n) => `${n} first ${plural(n, 'visit', 'visits')}`,
  lapsed_returning: (n) => `${n} back after a long while`,
  birthday: (n) => `${n} ${plural(n, 'birthday', 'birthdays')} this week`,
  medical_alert: (n) => `${n} intake ${plural(n, 'heads-up', 'heads-ups')}`,
  unconfirmed: (n) => `${n} not confirmed`,
  no_intake: (n) => `${n} without forms`,
  insurance_stale: (n) => `${n} with insurance to check`,
  balance: (n) => `${n} with a balance`,
  deposit_pending: (n) => `${n} ${plural(n, 'deposit', 'deposits')} not completed`,
  unreachable: (n) => `${n} with no way to reach them`,
}

/** One line per flag that appears on the day, counted in VISITS. */
export function tallyDay(visits: ReadonlyArray<Pick<HuddleVisitView, 'flags'>>): HuddleTally[] {
  const counts = new Map<HuddleFlagKey, number>()
  for (const v of visits) {
    for (const key of Array.from(new Set(v.flags.map((f) => f.key)))) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return TALLY_ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => ({
    key: k,
    tone: flagTone(k),
    text: TALLY_TEXT[k](counts.get(k)!),
  }))
}

export interface HuddleDayView {
  dayKey: string
  /** "Wednesday, November 26" — clinic-local, formatted on the server. */
  dayLabel: string
  visits: HuddleVisitView[]
  tally: HuddleTally[]
}

/** How many of a day's visits still need something before they sit down. */
export function needsPrepCount(visits: ReadonlyArray<Pick<HuddleVisitView, 'flags' | 'state'>>): number {
  return visits.filter((v) => v.state === 'ahead' && v.flags.some((f) => f.tone === 'warn')).length
}

// ── Lines (the recap and the heads-up) ───────────────────────────────

export interface HuddleLine {
  key: string
  tone: Tone
  text: string
  /** The line with patient names left out, when it names anyone. */
  quiet?: string
  href?: string
  cta?: string
}

/** "Maria R., Sam T. and 2 more" — never a wall of names. */
export function namesList(names: readonly string[], max = 3): string {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  if (shown.length === 0) return ''
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`
  if (shown.length === 1) return shown[0]
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

export interface RecapFacts {
  /** Visits on the day that were not cancelled. */
  held: number
  completed: number
  /** Full names of the patients who did not make it. */
  noShows: string[]
  cancelled: number
  /** Visits still sitting in scheduled / confirmed — nobody said what happened. */
  unmarked: number
  /** Full names of patients whose FIRST visit was seated that day. */
  firstVisits: string[]
  /** Visits booked through our own doors (site, portal, recall link) since that day began. */
  bookedOnline: number
  /** The ledger's work-only counts since that day began, by capability. */
  work: Record<string, number>
}

/**
 * The last working day, in the order a team would tell it: what happened,
 * who to welcome, who to call, what the app handled meanwhile. Celebration
 * is part of the honesty law — a first visit is said by name.
 */
export function buildRecapLines(facts: RecapFacts): HuddleLine[] {
  const lines: HuddleLine[] = []
  const { held, completed, noShows, cancelled, unmarked, firstVisits, bookedOnline } = facts

  if (held > 0) {
    lines.push(
      completed === held
        ? { key: 'happened', tone: 'ok', text: held === 1 ? 'The one visit on the books happened.' : `All ${held} visits happened.` }
        : { key: 'happened', tone: 'neutral', text: `${completed} of ${held} ${plural(held, 'visit', 'visits')} happened.` },
    )
  }
  if (firstVisits.length > 0) {
    const n = firstVisits.length
    lines.push({
      key: 'first_visits',
      tone: 'special',
      text: `${namesList(firstVisits)} had ${plural(n, 'a first visit', 'first visits')} — ${plural(n, 'a new patient', 'new patients')} in the practice.`,
      quiet: `${n} first ${plural(n, 'visit', 'visits')} seated — ${plural(n, 'a new patient', 'new patients')} in the practice.`,
    })
  }
  if (noShows.length > 0) {
    const n = noShows.length
    lines.push({
      key: 'no_shows',
      tone: 'warn',
      text: `${namesList(noShows)} didn’t make it — worth a call to rebook.`,
      quiet: `${n} ${plural(n, 'patient', 'patients')} didn’t make it — worth a call to rebook.`,
      href: '/appointments?window=past_30d',
      cta: 'Open the agenda',
    })
  }
  if (unmarked > 0) {
    lines.push({
      key: 'unmarked',
      tone: 'warn',
      text: `${unmarked} ${plural(unmarked, 'visit still says', 'visits still say')} scheduled — did ${plural(unmarked, 'it', 'they')} happen?`,
      href: '/appointments?window=past_30d&attention=unmarked',
      cta: 'Mark what happened',
    })
  }
  if (cancelled > 0) {
    lines.push({ key: 'cancelled', tone: 'neutral', text: `${cancelled} ${plural(cancelled, 'visit was', 'visits were')} cancelled.` })
  }
  if (bookedOnline > 0) {
    lines.push({
      key: 'booked_online',
      tone: 'ok',
      text: `${bookedOnline} ${plural(bookedOnline, 'visit was', 'visits were')} booked online since.`,
    })
  }
  const did = describeWork(facts.work)
  if (did) lines.push({ key: 'work', tone: 'neutral', text: `Since then the Dream Team handled: ${did}.` })
  return lines
}

export interface HuddleRecapView {
  /** "Tuesday, November 25" */
  dayLabel: string
  /** True when the recap day is the calendar day before today. */
  isYesterday: boolean
  lines: HuddleLine[]
}

export interface HeadsUpFacts {
  closures: ReadonlyArray<ClosureRange>
  /** null = the Follow-ups door is closed; the Huddle never nags about a module the practice has not opened. */
  followupsDue: number | null
  unreadMessages: number
  /** null = the Inquiries door is closed. */
  newInquiries: number | null
  openProposals: number
}

/** The few things waiting on the team — each with its door. */
export function buildHeadsUp(facts: HeadsUpFacts): HuddleLine[] {
  const lines: HuddleLine[] = []
  for (const c of facts.closures.slice(0, 2)) {
    lines.push({
      key: `closure_${c.startsOn}`,
      tone: 'info',
      text: `Closed ${formatClosureRange(c)}${c.label ? ` — ${c.label}` : ''}.`,
      href: '/settings/closures',
      cta: 'Closures',
    })
  }
  if (facts.followupsDue != null && facts.followupsDue > 0) {
    const n = facts.followupsDue
    lines.push({
      key: 'followups',
      tone: 'warn',
      text: `${n} ${plural(n, 'follow-up is', 'follow-ups are')} due.`,
      href: '/followups',
      cta: 'Open follow-ups',
    })
  }
  if (facts.unreadMessages > 0) {
    const n = facts.unreadMessages
    lines.push({
      key: 'messages',
      tone: 'warn',
      text: `${n} patient ${plural(n, 'conversation is', 'conversations are')} waiting on a reply.`,
      href: '/messages',
      cta: 'Open messages',
    })
  }
  if (facts.newInquiries != null && facts.newInquiries > 0) {
    const n = facts.newInquiries
    lines.push({
      key: 'inquiries',
      tone: 'warn',
      text: `${n} new ${plural(n, 'inquiry hasn’t', 'inquiries haven’t')} been answered.`,
      href: '/leads',
      cta: 'Open inquiries',
    })
  }
  if (facts.openProposals > 0) {
    const n = facts.openProposals
    lines.push({
      key: 'proposals',
      tone: 'warn',
      text: `The Dream Team has ${n} ${plural(n, 'thing', 'things')} ready for a yes.`,
      href: '/dream-team',
      cta: 'See them',
    })
  }
  return lines
}

// ── Where it came from ───────────────────────────────────────────────

export interface HuddleSource {
  text: string
  href?: string
  cta?: string
}

/** "12 minutes ago" — a duration, so it needs no timezone. */
export function agoLabel(from: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} ${plural(mins, 'minute', 'minutes')} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${plural(hours, 'hour', 'hours')} ago`
  const days = Math.round(hours / 24)
  return `${days} ${plural(days, 'day', 'days')} ago`
}

/**
 * Law 2: the page says where its schedule comes from, and how old the read
 * is. With no practice software connected it says what it CAN see and opens
 * the door — it never passes a thin list off as the whole day.
 */
export function sourceLine(link: PmsLink, lastSyncAt: Date | null, now: Date): HuddleSource {
  switch (link.kind) {
    case 'connected': {
      const vendor = link.vendorLabel ?? 'your practice software'
      return {
        text: lastSyncAt
          ? `The schedule and balances come from ${vendor}, last synced ${agoLabel(lastSyncAt, now)}.`
          : `The schedule and balances come from ${vendor}. The first sync has not finished yet.`,
      }
    }
    case 'pending':
      return {
        text: `We’re connecting ${link.vendorLabel}. Until then this shows only the visits booked through your website and front desk here.`,
        href: PMS_DOOR,
        cta: 'See the request',
      }
    case 'none':
      return {
        text: 'This shows only the visits booked through your website and front desk here. Connect your practice software and the whole schedule shows up.',
        href: PMS_DOOR,
        cta: 'Connect it',
      }
  }
}

// ── The whole page ───────────────────────────────────────────────────

export interface HuddleView {
  /** Clinic-local "7:42 AM" — when this read was taken. */
  asOf: string
  source: HuddleSource
  /** The last day the practice saw patients (within a week), or null. */
  recap: HuddleRecapView | null
  today: HuddleDayView
  /** The next day with visits on the books (within a week), or null. */
  next: (HuddleDayView & { isTomorrow: boolean }) | null
  headsUp: HuddleLine[]
}

/** The one-line read of today for the page header and the morning email. */
export function todaySummary(today: Pick<HuddleDayView, 'visits'>): string {
  const n = today.visits.length
  if (n === 0) return 'Nothing on the books today.'
  const prep = needsPrepCount(today.visits)
  const visits = `${n} ${plural(n, 'visit', 'visits')} today`
  if (prep === 0) return `${visits} — everyone is ready.`
  return `${visits} — ${prep} ${plural(prep, 'needs', 'need')} a little prep.`
}
