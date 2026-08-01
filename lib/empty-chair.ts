/**
 * THE EMPTY CHAIR (Transformation Phase 5 — limb 2), pure half.
 *
 * An empty chair is the most expensive thing in a dental practice: the rent,
 * the staff and the equipment are all paid for whether or not somebody is
 * sitting in it. Every practice knows this and almost none of them act on it,
 * because acting on it means somebody noticing on Monday that Thursday looks
 * thin and then finding the time to do something about it.
 *
 * WHAT THIS IS NOT. It is not a utilization dashboard. "Your week is 43%
 * booked", with a gauge and a trend arrow, passes DESIGN.md's test on the
 * wrong side: it asks the clinic to operate something. It hands a busy
 * practice a number and a feeling and no work done. A gauge has never filled
 * a chair.
 *
 * WHAT IT IS. The machine reads the practice's own hours, chairs and booked
 * visits, sees which days in the near window will sit half empty, writes the
 * invitation naming those days, and asks one question: "Thursday and Friday
 * are half empty — I'd invite the 34 patients who are due. Send it?"
 *
 * Why a pure module: which days count as soft, whether a week is worth
 * interrupting a human about, and the sentence the practice reads are the
 * parts worth pinning in tests, and none of them need a database.
 */

/**
 * The near window, in days from today (clinic-local), INCLUSIVE.
 *
 * Not tomorrow: nobody rearranges their week for a cleaning on eighteen
 * hours' notice, and an invitation that arrives too late to act on reads as
 * noise. Not next month either — a practice cannot tell you today whether
 * the 14th is quiet, and by the time it arrives the answer has changed.
 *
 * The span is exactly SEVEN days on purpose: eight would put the same
 * weekday at both ends of the window, and the card names days by weekday
 * ("Thursday and Friday"), which would then be ambiguous about which
 * Thursday it meant.
 */
export const FILL_WINDOW_START_DAYS = 3
export const FILL_WINDOW_END_DAYS = 9

/** A day is SOFT when at least this share of its openings are still free.
 *  Half is the line where a practice would describe the day as quiet out
 *  loud; below it, they would say "we've got a couple of gaps", which is not
 *  worth emailing a hundred people about. */
export const SOFT_DAY_RATIO = 0.5

/** One quiet day is a Tuesday. Two or more is a week worth doing something
 *  about — and it is also what makes the sentence honest: a card that
 *  interrupts a human should be describing a pattern, not a blip. */
export const MIN_SOFT_DAYS = 2

/** A day with almost no openings at all (odd half-day hours, a public
 *  holiday left open by mistake) is not a signal — 50% of two slots is one
 *  slot, and a practice does not want an email campaign over it. */
export const MIN_DAY_OPENINGS = 6

export interface DayLoad {
  /** Clinic-local calendar day, YYYY-MM-DD — the stable identity. */
  dateKey: string
  /** What the practice and its patients call it: "Thursday". */
  label: string
  /** Openings still free. */
  open: number
  /** Openings the day has when empty — the clinic's own hours and chairs. */
  total: number
}

/** The days in the window a practice would call quiet. Order is preserved:
 *  the caller reads the window in date order and the card should too. */
export function softDays(days: readonly DayLoad[]): DayLoad[] {
  return days.filter(
    (d) => d.total >= MIN_DAY_OPENINGS && d.open / d.total >= SOFT_DAY_RATIO,
  )
}

/**
 * Is this week worth interrupting a human about?
 *
 * Deliberately conservative. The cost of a false positive is a practice
 * emailing its patient list about a week that was actually fine, which is
 * exactly how a machine's cards start getting dismissed unread — and a card
 * nobody reads is worse than no card, because it takes the real ones down
 * with it.
 */
export function worthFilling(days: readonly DayLoad[]): boolean {
  return softDays(days).length >= MIN_SOFT_DAYS
}

/** How many openings the soft days are carrying between them — the number
 *  the card leads with, because "two days are quiet" is a shrug and "you've
 *  got 22 open appointment times" is a fact. */
export function openCount(days: readonly DayLoad[]): number {
  return softDays(days).reduce((n, d) => n + d.open, 0)
}

/** "Thursday" · "Thursday and Friday" · "Wednesday, Thursday and Friday" —
 *  the way a person says it, in one place so the card, the email and the
 *  ledger entry can never phrase it three different ways. */
export function describeDays(labels: readonly string[]): string {
  const l = labels.filter((s) => s && s.trim())
  if (l.length === 0) return ''
  if (l.length === 1) return l[0]
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`
}

/** The email's subject. Names the days: a subject line that says "we have
 *  openings" is every dental email ever sent, and one that says "Thursday
 *  and Friday" is about the reader's actual week. */
export function fillSubject(labels: readonly string[]): string {
  const days = describeDays(labels)
  return days ? `We’ve got room ${days}` : 'We’ve got room this week'
}

/**
 * The email body. CODE-OWNED, not AI-drafted — the same posture as the
 * quiet-engine recall campaign. There is nothing here a model could write
 * better than a careful sentence, and a type that needs no AI keeps working
 * for a practice whose key expired.
 *
 * {{firstName}} and {{bookingUrl}} are the campaign engine's per-recipient
 * merge tokens. Anti-shame by law: a patient who has not been in for a year
 * is not told so, and nothing here implies the practice is desperate for
 * business — "we've got room" is hospitality, "please come in, we're empty"
 * is a confession.
 */
export function fillBody(labels: readonly string[]): string {
  const days = describeDays(labels)
  const when = days ? `on ${days}` : 'later this week'
  return `Hi {{firstName}},

We’ve got some openings ${when}, and it seemed like a good moment to say hello — you’re about due for a cleaning.

No rush and no pressure. If one of those days happens to suit you, picking a time takes about a minute.`
}

/** What the machine says it did once the invitation is out. Plural nouns and
 *  real counts, in the narrator's voice. */
export function fillLedgerSummary(sent: number, labels: readonly string[]): string {
  const days = describeDays(labels)
  const who = `${sent} ${sent === 1 ? 'patient' : 'patients'}`
  return days ? `Invited ${who} in for ${days}` : `Invited ${who} in this week`
}

/** The same sentence for a send RECOVERED from a stranded approve: the work
 *  reached patients on an earlier attempt and the count is unknowable from
 *  here, so it names the audience instead of a number. Lives beside its
 *  sibling so one capability's ledger never tells two different stories
 *  about one event. */
export function fillRecoveredSummary(labels: readonly string[]): string {
  const days = describeDays(labels)
  return days ? `Invited your recall list in for ${days}` : 'Invited your recall list in this week'
}

/** The card's own title — the number first, then the ask. */
export function fillCardTitle(days: readonly DayLoad[], recipients: number): string {
  const labels = softDays(days).map((d) => d.label)
  const open = openCount(days)
  return `${open} open ${open === 1 ? 'time' : 'times'} ${describeDays(labels)} — invite ${recipients} ${
    recipients === 1 ? 'patient' : 'patients'
  } who are due?`
}

/**
 * Would this card still be TRUE if it were approved right now?
 *
 * The card names specific days, which makes it perishable in a way the other
 * proposal types are not: a plan can shift forward, an invitation to last
 * Thursday cannot. Two ways it rots — the days have arrived (or passed), and
 * the days quietly filled up on their own, which is the good outcome and
 * still means the email must not go.
 *
 * `current` is the window read fresh at approve time, keyed by dateKey.
 */
export function planStillTrue(
  namedDays: readonly string[],
  current: readonly DayLoad[],
): boolean {
  if (namedDays.length === 0) return false
  const stillSoft = new Set(softDays(current).map((d) => d.dateKey))
  // EVERY named day must still be both in the window and still quiet. Not
  // "some": the email says "Thursday and Friday", and sending it once Friday
  // has filled makes the practice look like it does not know its own
  // schedule — which is the one thing this feature exists to disprove.
  return namedDays.every((k) => stillSoft.has(k))
}
