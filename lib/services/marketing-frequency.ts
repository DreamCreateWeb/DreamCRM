import 'server-only'
import { and, eq, gte, inArray, like, ne, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * The cross-campaign frequency cap (campaigns phase 4, 2026-07-22): no
 * patient gets more than MAX_SENDS marketing messages in any rolling
 * WINDOW_DAYS — across manual campaigns AND the retention automations
 * (both write the same campaign_events 'sent' rows, so one query covers
 * every marketing sender). Transactional email (reminders, receipts,
 * portal invites) is not campaign email and never counts.
 *
 * THE IDENTITY IS THE PATIENT, NOT THE ADDRESS (2026-08-02, ahead of SMS).
 *
 * Until now the cap counted by email, which was exactly right in a world
 * where email was the only thing that could send: a recipient with no email
 * was dropped by `eligibleForChannel` before it ever reached here, so
 * letting them through was harmless. The moment SMS can send, the same rule
 * becomes two holes:
 *
 *  - a patient with a phone and no email (the public booking form makes
 *    phone REQUIRED and email OPTIONAL, so these exist) would have no key
 *    at all and receive marketing without limit;
 *  - a patient reachable both ways could take MAX_SENDS emails AND
 *    MAX_SENDS texts in a week — double the cap a human thinks they set.
 *
 * So the key is `patientId ?? email`. One patient is one person however many
 * ways we can reach them, which is what this module's own docstring has
 * always claimed and what a clinic means when they set a limit. Customer
 * (platform-tenant) rows carry no patientId and keep keying by email.
 */

export const FREQUENCY_MAX_SENDS = 2
export const FREQUENCY_WINDOW_DAYS = 7

/** What the cap needs to know about a recipient. `patientId` is optional so
 *  customer-source callers stay source-compatible. */
export interface CapKeyed {
  email: string | null
  patientId?: string | null
}

/**
 * A recipient's identity for capping purposes. Null means "no way to count
 * this one" — a row with neither a patient nor an address, which should not
 * exist and is let through rather than silently suppressed.
 *
 * Exported so the send path and the tests answer from the same rule.
 */
export function capKey(r: CapKeyed): string | null {
  return r.patientId ?? r.email ?? null
}

/** The same rule applied to a stored event row. Kept beside `capKey` so the
 *  two halves of the join — what we count and what we count it against —
 *  can never drift apart. */
function eventKey(row: { patientId: string | null; email: string | null }): string | null {
  return row.patientId ?? row.email ?? null
}

/** Split a recipient list into the two lookup sets one query needs. */
function keySets(recipients: readonly CapKeyed[]): { ids: string[]; emails: string[] } {
  const ids = new Set<string>()
  const emails = new Set<string>()
  for (const r of recipients) {
    if (r.patientId) ids.add(r.patientId)
    else if (r.email) emails.add(r.email)
  }
  return { ids: Array.from(ids), emails: Array.from(emails) }
}

/**
 * Match stored events against either key set. A patient-source send writes
 * BOTH patient_id and recipient_email on one row, so matching on either and
 * then counting by `patientId ?? email` cannot double-count a single send.
 */
function keyMatch(ids: string[], emails: string[]) {
  const clauses = []
  if (ids.length > 0) clauses.push(inArray(schema.campaignEvents.patientId, ids))
  if (emails.length > 0) clauses.push(inArray(schema.campaignEvents.recipientEmail, emails))
  // drizzle's or() emits its own parenthesised group, so this stays safely
  // inside the surrounding and() chain.
  return clauses.length === 1 ? clauses[0] : or(...clauses)
}

/**
 * Partition recipients into those still under the cap and those already at
 * it. Org-scoped via the campaigns join (campaign_events has no org column
 * of its own). One grouped query regardless of list size.
 */
export async function partitionByFrequencyCap<R extends CapKeyed>(
  organizationId: string,
  recipients: R[],
  now: Date = new Date(),
): Promise<{ allowed: R[]; suppressed: R[] }> {
  const { ids, emails } = keySets(recipients)
  if (ids.length === 0 && emails.length === 0) return { allowed: recipients, suppressed: [] }

  const since = new Date(now.getTime() - FREQUENCY_WINDOW_DAYS * 86_400_000)
  const rows = await db
    .select({
      email: schema.campaignEvents.recipientEmail,
      patientId: schema.campaignEvents.patientId,
    })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        eq(schema.campaignEvents.type, 'sent'),
        gte(schema.campaignEvents.occurredAt, since),
        keyMatch(ids, emails),
      ),
    )

  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = eventKey(r)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const allowed: R[] = []
  const suppressed: R[] = []
  for (const r of recipients) {
    const k = capKey(r)
    if (k && (counts.get(k) ?? 0) >= FREQUENCY_MAX_SENDS) suppressed.push(r)
    else allowed.push(r)
  }
  return { allowed, suppressed }
}

/**
 * One-shot automation guard: partition out recipients who already received a
 * send from ANY campaign whose automationKey starts with `automationKeyPrefix`
 * (e.g. 'welcome:'). The weekly welcome key + 7-day audience window can
 * overlap by a few minutes of cron jitter at the week boundary — this makes
 * "welcomed exactly once" true by construction instead of by timing.
 *
 * Keyed the same way as the cap above, for the same reason: "welcomed exactly
 * once" has to mean once per PERSON, or a phone-only patient gets welcomed
 * every week forever.
 */
export async function partitionByPriorAutomationSend<R extends CapKeyed>(
  organizationId: string,
  automationKeyPrefix: string,
  recipients: R[],
  excludeCampaignId?: number,
): Promise<{ allowed: R[]; suppressed: R[] }> {
  const { ids, emails } = keySets(recipients)
  if (ids.length === 0 && emails.length === 0) return { allowed: recipients, suppressed: [] }

  const conditions = [
    eq(schema.campaigns.organizationId, organizationId),
    like(schema.campaigns.automationKey, `${automationKeyPrefix}%`),
    eq(schema.campaignEvents.type, 'sent'),
    keyMatch(ids, emails),
  ]
  if (excludeCampaignId !== undefined) conditions.push(ne(schema.campaigns.id, excludeCampaignId))

  const rows = await db
    .select({
      email: schema.campaignEvents.recipientEmail,
      patientId: schema.campaignEvents.patientId,
    })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(and(...conditions))

  const alreadySent = new Set<string>()
  for (const r of rows) {
    const k = eventKey(r)
    if (k) alreadySent.add(k)
  }
  const allowed: R[] = []
  const suppressed: R[] = []
  for (const r of recipients) {
    const k = capKey(r)
    if (k && alreadySent.has(k)) suppressed.push(r)
    else allowed.push(r)
  }
  return { allowed, suppressed }
}
