import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { toE164 } from '@/lib/phone'
import { isConsentSource, type ConsentSource } from '@/lib/sms-consent'

/**
 * SMS CONSENT, recorded — the only writers of `patient.marketing_sms_opt_in`.
 *
 * Until now the sole writer in the entire repo was the demo seeder, which
 * means the TCPA capture path the schema comment describes ("explicit opt-in
 * required by TCPA, capture via intake form / booking checkbox / one-time
 * keyword reply") did not exist. This is it.
 *
 * Two rules the rest of the codebase depends on:
 *
 *  1. **An opt-out is louder than an opt-in.** Recording consent NEVER
 *     silently overturns a previous STOP. A patient who unsubscribed and
 *     then books online without noticing the checkbox has not changed their
 *     mind, and re-subscribing them is the single fastest way to earn a
 *     complaint — which is the metric that gets a number blocked.
 *     Re-subscribing takes a deliberate act: replying START, or staff doing
 *     it on the record.
 *  2. **Best-effort, always.** Consent bookkeeping must never fail a
 *     booking. A patient who got an appointment but no consent row is a
 *     patient we simply don't text; a patient who lost their appointment
 *     because a consent write threw is a support call.
 */

/** Whether an earlier STOP is still standing. */
async function hasOptedOut(organizationId: string, patientId: string): Promise<boolean> {
  const [row] = await db
    .select({ optOutAt: schema.patient.marketingSmsOptOutAt })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  return !!row?.optOutAt
}

export interface RecordConsentResult {
  ok: boolean
  /** True when consent was newly written. False when it was declined, the
   *  number was unusable, or an earlier opt-out is still standing. */
  recorded: boolean
  reason?: 'declined' | 'no_number' | 'previously_opted_out' | 'error'
}

/**
 * Record a patient's affirmative opt-in to marketing texts.
 *
 * `agreed` comes straight from the checkbox: a false value is a real answer
 * ("no thanks") and is recorded as nothing rather than as an opt-out, because
 * not ticking a box is not the same act as replying STOP and must not be
 * stored as though it were.
 */
export async function recordSmsOptIn(
  organizationId: string,
  patientId: string,
  opts: { agreed: boolean; source: ConsentSource; phone?: string | null; now?: Date },
): Promise<RecordConsentResult> {
  if (!opts.agreed) return { ok: true, recorded: false, reason: 'declined' }
  if (!isConsentSource(opts.source)) return { ok: false, recorded: false, reason: 'error' }
  try {
    // Consent to be texted at a number we cannot text is not consent to
    // anything. Recorded as nothing rather than as a row that will never be
    // actionable and will look, to anyone auditing later, like a real opt-in.
    // Only checked when a number was supplied — a portal or staff opt-in
    // trusts the number already on the record.
    if (opts.phone !== undefined && !toE164(opts.phone)) {
      return { ok: true, recorded: false, reason: 'no_number' }
    }
    if (await hasOptedOut(organizationId, patientId)) {
      return { ok: true, recorded: false, reason: 'previously_opted_out' }
    }
    await db
      .update(schema.patient)
      .set({
        marketingSmsOptIn: 1,
        marketingSmsOptInAt: opts.now ?? new Date(),
        marketingOptInSource: opts.source,
      })
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    return { ok: true, recorded: true }
  } catch (e) {
    // Never fails the flow that captured it (see the law at the top).
    console.error('[sms-consent] opt-in not recorded', e)
    return { ok: false, recorded: false, reason: 'error' }
  }
}

/**
 * Record an opt-out. Stamps the time as well as clearing the flag, because
 * "they said stop, and here is when" is the record that matters if it is
 * ever questioned — and because `hasOptedOut` above reads that stamp to keep
 * a later booking from quietly resubscribing them.
 *
 * Returns how many patients were affected: a STOP arrives from a NUMBER, and
 * one number can belong to more than one patient (a family sharing a mobile,
 * which this codebase already models deliberately). Every one of them must
 * stop, because the carrier's view is the number, not our chart.
 */
export async function recordSmsOptOut(
  organizationId: string,
  target: { patientId: string } | { phone: string },
  now: Date = new Date(),
): Promise<number> {
  try {
    const patch = { marketingSmsOptIn: 0, marketingSmsOptOutAt: now }
    if ('patientId' in target) {
      await db
        .update(schema.patient)
        .set(patch)
        .where(
          and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, target.patientId)),
        )
      return 1
    }
    // By NUMBER. `patient.phone` stores whatever the front desk typed, so a
    // column equality test would miss the same number spelled differently —
    // the normalisation has to happen in application code against the real
    // rows, which is why this reads then writes rather than one UPDATE.
    const e164 = toE164(target.phone)
    if (!e164) return 0
    const rows = await db
      .select({ id: schema.patient.id, phone: schema.patient.phone })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, organizationId))
    const matches = rows.filter((r) => toE164(r.phone) === e164)
    for (const m of matches) {
      await db
        .update(schema.patient)
        .set(patch)
        .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, m.id)))
    }
    return matches.length
  } catch (e) {
    console.error('[sms-consent] opt-out not recorded', e)
    return 0
  }
}

/**
 * A deliberate re-subscribe (the patient replied START, or staff ticked it
 * on the record having been told). This is the ONLY path that clears a
 * standing opt-out — `recordSmsOptIn` refuses to, on purpose.
 */
export async function clearSmsOptOut(
  organizationId: string,
  patientId: string,
  source: ConsentSource,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    await db
      .update(schema.patient)
      .set({
        marketingSmsOptIn: 1,
        marketingSmsOptInAt: now,
        marketingSmsOptOutAt: null,
        marketingOptInSource: source,
      })
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    return true
  } catch (e) {
    console.error('[sms-consent] re-subscribe not recorded', e)
    return false
  }
}
