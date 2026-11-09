/**
 * ONE NOTE PER HOUSEHOLD (ML-29, G1-13) — the pure half.
 *
 * Reminders already collapse a family's same-day visits into one email on
 * the shared inbox (lib/services/reminder-automation.ts). The recall and
 * reactivation sends had only the resume filter, so a family of four on one
 * address got four "time for a cleaning" emails in a row. This groups a
 * campaign's recipients by the inbox they share — the household IS the
 * shared address; a dependent with their own email is their own reader —
 * and names everyone in the note ("Maya and Leo").
 *
 * The frequency cap stays patient-keyed: the send path logs one 'sent' row
 * PER MEMBER of a household email, so each person's count moves and the
 * resume filter drops each of them on a re-run.
 */

export interface HouseholdMember {
  email: string | null
  firstName: string
}

export interface Household<R extends HouseholdMember> {
  /** The shared inbox, lowercased — the key every member resolved to. */
  email: string
  /** Every recipient on that inbox, in the order the audience listed them. */
  members: R[]
}

/** The key two recipients share when one email reaches both. Null = no
 *  inbox (the send path skips those; they never form a household). */
export function householdKey(r: HouseholdMember): string | null {
  const e = r.email?.trim().toLowerCase()
  return e ? e : null
}

/**
 * Group recipients by shared inbox, preserving first-seen order so a
 * capped send walks the same people it would have walked one by one.
 * Recipients without an email are dropped (nothing to send to).
 */
export function groupByHousehold<R extends HouseholdMember>(recipients: readonly R[]): Household<R>[] {
  const byKey = new Map<string, Household<R>>()
  for (const r of recipients) {
    const key = householdKey(r)
    if (!key) continue
    const h = byKey.get(key)
    if (h) h.members.push(r)
    else byKey.set(key, { email: key, members: [r] })
  }
  return Array.from(byKey.values())
}

/** "Maya", "Maya and Leo", "Maya, Leo and Sam" — a first name each, blank
 *  ones falling back to the campaign's own warm default. */
export function householdNames(members: readonly HouseholdMember[], fallback = 'there'): string {
  const names = members.map((m) => m.firstName?.trim() || fallback)
  if (names.length === 0) return fallback
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The one line a household email opens with, above the campaign's own
 * words, so everyone the note is for is named even when the body never
 * uses {{firstName}}. Campaign-agnostic on purpose — a birthday note and a
 * recall note share one inbox the same way — and anti-shame: "for", never
 * "overdue". Returns null for a single reader (nothing to explain).
 */
export function householdLeadIn(members: readonly HouseholdMember[]): string | null {
  if (members.length < 2) return null
  return `One note for the whole household — this one’s for ${householdNames(members)}.`
}
