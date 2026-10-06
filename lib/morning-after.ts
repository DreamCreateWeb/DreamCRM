/**
 * THE MORNING AFTER — docs/ACTIVATION.md law 6, slice S7.
 *
 * "The digest on day two must say what happened and name one thing to do,
 * even for a thin clinic. If it has nothing to say, it says what it is
 * waiting on."
 *
 * Before this, the morning email was a to-do list: follow-ups due, visits
 * to confirm, leads waiting. A clinic with none of those got NO email at
 * all — which is exactly the thin, day-two clinic the setup call just
 * promised "tomorrow morning this will email you what it did overnight".
 * The product's first morning was silence.
 *
 * This is the pure half: given what the machine did since yesterday, which
 * activation events have happened, the cards on a human, what is broken
 * and what is pending on the platform, it writes the three sentences the
 * digest adds — WHAT HAPPENED, ONE THING, WHAT IT WAITS ON — and decides
 * whether those alone are worth an email. The service (daily-digest.ts)
 * reads the inputs; the renderer puts the sentences in the body.
 */

import { ACTIVATION_EVENTS, type Activation, type ActivationKey } from '@/lib/activation'
import { standupNoun } from '@/lib/standup-nouns'

/** Through this day the digest sends even when it has nothing to do — a
 *  quiet first week is narrated, never skipped. */
export const MORNING_AFTER_DAYS = 7
/** Through this day the activation ladder's next step counts as "one thing
 *  to do" on its own; after that it would be a daily nag, so it only rides
 *  an email that is going out anyway. */
export const ONE_THING_DAYS = 30
/** How many count-lines the overnight sentence names before "and N more". */
const MAX_WORK_LINES = 5

export interface MorningAfterInput {
  /** Whole days since the org was created (lib/first-week.ts dayNumber). */
  day: number
  activation: Activation
  /** The ledger's work-only counts since yesterday morning, by capability. */
  work: Record<string, number>
  /** Engine failures in the same window (tried and couldn't). */
  failures: number
  /** Open cards waiting on a HUMAN — soonest-to-expire first. */
  openCards: Array<{ title: string }>
  /** Doors pending on the platform (the PMS bind, the SMS carriers). */
  pendingOnUs: Array<{ label: string }>
  /** The readiness resolver's BROKEN facts — a thing to fix beats a thing to start. */
  attention: Array<{ label: string; summary: string; href: string }>
}

export type OneThingKind = 'card' | 'attention' | 'activation'

export interface OneThing {
  kind: OneThingKind
  text: string
  href: string
}

export interface MorningAfter {
  /** "Since yesterday I handled: …" — null when the machine did nothing and nothing failed. */
  happened: string | null
  oneThing: OneThing | null
  /** "Still on us: …" — null when nothing is pending on the platform. */
  waitingOn: string | null
  /** The first-week sentence for a night with nothing in any of the three. */
  quietLine: string | null
  /** Whether these sentences alone justify the email when the to-do list is empty. */
  sendsAlone: boolean
}

/** The door for each activation event not yet reached — what to do and where. */
export const ACTIVATION_DOORS: Record<ActivationKey, { text: string; href: string }> = {
  a1: { text: 'Connect your patients — bind your practice software or import a CSV, and the machine can start.', href: '/integrations' },
  a2: { text: 'Send your first message to patients — start a recall campaign; the audience is already counted.', href: '/growth/outreach?new=1' },
  a3: { text: 'Get your first booking through the site — share your booking link with the next patient who calls.', href: '/website/share' },
  a4: { text: 'Ask for your first review — mark a visit completed and the ask goes out on its own.', href: '/growth/reviews' },
  a5: { text: 'Get your first form in — send an intake form to the next new patient.', href: '/intake-forms' },
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** "12 appointment reminders · 2 review invitations · 1 campaign send" */
export function describeWork(work: Record<string, number>): string | null {
  const lines = Object.entries(work)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  if (lines.length === 0) return null
  const shown = lines.slice(0, MAX_WORK_LINES).map(([cap, n]) => `${n} ${standupNoun(cap, n)}`)
  const rest = lines.slice(MAX_WORK_LINES).reduce((sum, [, n]) => sum + n, 0)
  if (rest > 0) shown.push(`and ${rest} more small ${plural(rest, 'thing', 'things')}`)
  return shown.join(' · ')
}

function happenedLine(work: Record<string, number>, failures: number): string | null {
  const did = describeWork(work)
  const trouble =
    failures > 0
      ? `${failures} of my own ${plural(failures, 'job', 'jobs')} hit trouble — the Overview has the details.`
      : null
  if (did && trouble) return `⚙️ Since yesterday I handled: ${did}. ${trouble}`
  if (did) return `⚙️ Since yesterday I handled: ${did}.`
  if (trouble) return `⚙️ Nothing went out since yesterday — ${trouble}`
  return null
}

/**
 * The one thing, in the order it should be: finished work waiting on a yes
 * (the machine already did the job), then something broken (a thing to fix
 * beats a thing to start), then the next activation door while the clinic
 * is new enough for that to be news rather than a nag.
 */
export function pickOneThing(input: MorningAfterInput): OneThing | null {
  const card = input.openCards[0]
  if (card) {
    const more = input.openCards.length - 1
    const tail = more > 0 ? ` (and ${more} more waiting)` : ''
    return { kind: 'card', text: `Say yes to “${card.title}” on your Dream Team page${tail}.`, href: '/dream-team' }
  }
  const broken = input.attention[0]
  if (broken) {
    return { kind: 'attention', text: `${broken.label} — ${broken.summary}`, href: broken.href }
  }
  if (input.day < ONE_THING_DAYS) {
    const next = ACTIVATION_EVENTS.find((e) => input.activation[e.key] == null)?.key ?? null
    if (next) return { kind: 'activation', ...ACTIVATION_DOORS[next] }
  }
  return null
}

function waitingLine(pending: Array<{ label: string }>): string | null {
  if (pending.length === 0) return null
  const names = pending.map((p) => p.label).join(' · ')
  return `⏳ Still on us: ${names} — nothing to do on your side; you'll hear from Dream Create.`
}

export function buildMorningAfter(input: MorningAfterInput): MorningAfter {
  const happened = happenedLine(input.work, input.failures)
  const oneThing = pickOneThing(input)
  const waitingOn = waitingLine(input.pendingOnUs)
  const firstWeek = input.day < MORNING_AFTER_DAYS
  const quietLine =
    !happened && !oneThing && !waitingOn && firstWeek
      ? input.activation.a1 == null
        ? '🌙 A quiet night on my side — I start working the moment your patients are connected.'
        : '🌙 A quiet night on my side — nothing needed sending, and nothing is waiting on you yet. The first cards usually land within a day.'
      : null
  // What justifies the email on its own: work done (the product), a card
  // or a BROKEN thing (both actionable today — a broken sync or a listing
  // pointing at the old site is worth a line every morning until it is
  // fixed, the way the Overview banner already shows it), the ladder while
  // the clinic is new, and any night at all in the first week. What does
  // not: a pending-on-us line alone after the first week — that is ours.
  return {
    happened,
    oneThing,
    waitingOn,
    quietLine,
    sendsAlone: !!happened || !!oneThing || firstWeek,
  }
}
