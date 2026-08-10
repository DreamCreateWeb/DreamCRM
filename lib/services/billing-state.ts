import 'server-only'
import { eq, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveTrialState } from '@/lib/trial'

/**
 * THE SHUTDOWN RESOLVER (onboarding overhaul, owner ruling: "when a free
 * trial ends, we kill everything for that clinic"). One home for "is this
 * clinic dead", read by every engine and public surface that enforces it:
 * the public site + booking, the patient portal, the outbound engines
 * (reminders, review asks, retention automations, scheduled campaigns,
 * proposal generators), and the metered PMS sync.
 *
 * Shut down = trial expired with no paid subscription — exactly
 * `resolveTrialState(...).expired`, the same rule the dashboard wall uses,
 * so the wall and the kill can never disagree. Clinics never on a trial
 * (trial_ends_at null: comped, legacy, the demo) are never shut down.
 *
 * FAIL-OPEN on an unreadable database: killing a paying clinic's reminders
 * on a DB blip is strictly worse than one extra reminder from an expired
 * one. The direction every guard here inherits.
 *
 * NOT killed on purpose: patient payment-plan charges (money patients owe
 * the practice through Stripe Connect — a contractual flow between them,
 * not a feature of ours to switch off) and internal bookkeeping with no
 * external cost. Reactivation is just paying: everything stored stays, and
 * every gate reads live state, so the machine wakes the moment Stripe says
 * active.
 */

/** Org ids currently shut down. One query, resolved through the same pure
 *  rule as the dashboard wall. */
export async function listShutDownOrgIds(now: Date = new Date()): Promise<Set<string>> {
  try {
    const rows = await db
      .select({
        organizationId: schema.clinicProfile.organizationId,
        trialEndsAt: schema.clinicProfile.trialEndsAt,
        subscriptionStatus: schema.clinicProfile.subscriptionStatus,
        stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      })
      .from(schema.clinicProfile)
      .where(isNotNull(schema.clinicProfile.trialEndsAt))
    return new Set(rows.filter((r) => resolveTrialState(r, now).expired).map((r) => r.organizationId))
  } catch (e) {
    console.error('[billing-state] shutdown list unreadable (fail-open):', e)
    return new Set()
  }
}

/** One clinic's shutdown state. Missing profile = not shut down. */
export async function isClinicShutDown(organizationId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const [row] = await db
      .select({
        trialEndsAt: schema.clinicProfile.trialEndsAt,
        subscriptionStatus: schema.clinicProfile.subscriptionStatus,
        stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    return row ? resolveTrialState(row, now).expired : false
  } catch (e) {
    console.error('[billing-state] shutdown check unreadable (fail-open):', e)
    return false
  }
}
