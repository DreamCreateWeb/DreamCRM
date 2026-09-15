import 'server-only'
import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveTrialState, dueTrialReminder } from '@/lib/trial'
import { sendTrialReminderEmail, sendBillingPastDueEmail, type TrialEmailMilestone } from '@/lib/email'

/**
 * Billing comms TO the clinic owner (not patient-facing): the escalating
 * trial-ending reminder sweep (cron) and the failed-payment dunning email
 * (Stripe webhook). Both are platform-identity sends and ALWAYS reach the
 * owner — they're billing-critical, so they deliberately bypass the optional
 * in-app notification preferences.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')) || 'https://www.dreamcreatestudio.com'

/** Where to send the owner to fix billing: managed (reserved-plan) clinics go
 *  to the coupon-pre-applied activation flow, everyone else to the plan picker. */
function billingUrl(pendingPlanId: string | null): string {
  return pendingPlanId ? `${APP_URL}/billing/activate` : `${APP_URL}/settings/billing`
}

/** The clinic's billing contact — prefer the owner, fall back to an admin. */
export async function getClinicOwnerContact(
  organizationId: string,
): Promise<{ email: string; name: string | null } | null> {
  const rows = await db
    .select({ email: schema.user.email, name: schema.user.name, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        inArray(schema.member.role, ['owner', 'admin']),
      ),
    )
  if (rows.length === 0) return null
  const pick = rows.find((r) => r.role === 'owner') ?? rows[0]
  return pick.email ? { email: pick.email, name: pick.name ?? null } : null
}

export interface TrialReminderSweepResult {
  scanned: number
  sent: number
  skipped: number
  failed: number
}

/** Where a milestone stamp lives. Named once so the CLAIM and the RELEASE
 *  below cannot drift apart. */
const REMINDERS_COL = schema.clinicProfile.trialRemindersSent

/**
 * Take this clinic's milestone, atomically, BEFORE the email goes out
 * (DREAMCRM-57).
 *
 * Returns true if this run owns the send. Two things are load-bearing and both
 * are the same statement:
 *
 *   • The guard and the append are ONE `UPDATE … WHERE NOT (… @> …) RETURNING`,
 *     so of two overlapping cron runs exactly one gets a row back. The old code
 *     stamped AFTER the send, and the array it read came from a select at the
 *     TOP of the sweep — so run #2 starting while run #1 was mid-walk saw every
 *     not-yet-reached clinic as un-stamped and mailed it a second time. At
 *     at-least-once delivery on a 6-hourly schedule that is not a thin window,
 *     it is minutes wide.
 *   • The append happens in SQL against the CURRENT value, never against the
 *     snapshot. `[...sent, milestone]` re-wrote the whole array from a read
 *     that could be minutes old, so a run stamping 'day1' would DROP a 'day3'
 *     another run had stamped meanwhile — and the next tick, seeing no 'day3',
 *     would send that milestone again.
 *
 * Every bound parameter carries an explicit cast: drizzle binds interpolated
 * values untyped, and Postgres cannot resolve an untyped parameter against
 * `to_jsonb` or the overloaded jsonb `-`. Pinned by
 * tests/billing/trial-reminder-claim-sql.test.ts through the real dialect.
 */
async function claimTrialMilestone(organizationId: string, milestone: string): Promise<boolean> {
  const claimed = await db
    .update(schema.clinicProfile)
    .set({
      trialRemindersSent: sql`coalesce(${REMINDERS_COL}, '[]'::jsonb) || to_jsonb(${milestone}::text)`,
    })
    .where(
      and(
        eq(schema.clinicProfile.organizationId, organizationId),
        sql`NOT (coalesce(${REMINDERS_COL}, '[]'::jsonb) @> to_jsonb(${milestone}::text))`,
      ),
    )
    .returning({ organizationId: schema.clinicProfile.organizationId })
  return claimed.length > 0
}

/**
 * Give the milestone back after a send that did not happen, so a later tick
 * retries it.
 *
 * Claiming first trades one failure mode for another, and this is the half
 * that keeps the trade honest: a missed "your trial ends in 3 days" means an
 * owner hits the lock wall with no warning, which is worse than a duplicate
 * email. The claim makes us the exclusive holder until we release — no other
 * run can take a milestone the array already contains — so the release is safe
 * to do unconditionally.
 *
 * What it does NOT cover, stated rather than hidden: a process that dies
 * strictly between the claim committing and the send returning leaves the
 * milestone stamped and unsent. That window is one API call wide, against a
 * double-send window that was minutes wide, and the NEXT milestone still
 * fires.
 */
async function releaseTrialMilestone(organizationId: string, milestone: string): Promise<void> {
  await db
    .update(schema.clinicProfile)
    .set({
      trialRemindersSent: sql`coalesce(${REMINDERS_COL}, '[]'::jsonb) - ${milestone}::text`,
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

/**
 * Email every trialing clinic whose next reminder milestone is due (3 days /
 * 1 day / ends-today / ended) and hasn't been sent yet. The milestone is
 * CLAIMED before the send and released if the send fails, so overlapping runs
 * cannot double-email (DREAMCRM-57). Best-effort per clinic (one failure never
 * aborts the sweep). Bounded by a time window so the query never scans the
 * whole customer base. Meant to run a few times a day via cron.
 */
export async function sendDueTrialReminders(now: Date = new Date()): Promise<TrialReminderSweepResult> {
  // Only clinics within ~3 days of expiry (where the first reminder fires) and
  // up to 30 days past it (so a just-expired clinic still gets the 'ended' note,
  // but we don't re-scan ancient rows forever).
  const upper = new Date(now.getTime() + 3.5 * DAY_MS)
  const lower = new Date(now.getTime() - 30 * DAY_MS)

  const rows = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      trialEndsAt: schema.clinicProfile.trialEndsAt,
      subscriptionStatus: schema.clinicProfile.subscriptionStatus,
      stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      pendingPlanId: schema.clinicProfile.pendingPlanId,
      trialRemindersSent: schema.clinicProfile.trialRemindersSent,
    })
    .from(schema.clinicProfile)
    .where(
      and(
        isNotNull(schema.clinicProfile.trialEndsAt),
        lte(schema.clinicProfile.trialEndsAt, upper),
        gte(schema.clinicProfile.trialEndsAt, lower),
      ),
    )

  const result: TrialReminderSweepResult = { scanned: rows.length, sent: 0, skipped: 0, failed: 0 }

  for (const row of rows) {
    // A paid sub (or no trial) makes resolveTrialState return daysLeft=null →
    // dueTrialReminder returns null → naturally skipped.
    const state = resolveTrialState(
      {
        trialEndsAt: row.trialEndsAt,
        subscriptionStatus: row.subscriptionStatus,
        stripeSubscriptionId: row.stripeSubscriptionId,
      },
      now,
    )
    const sent = Array.isArray(row.trialRemindersSent) ? (row.trialRemindersSent as string[]) : []
    const milestone = dueTrialReminder(state.daysLeft, state.expired, sent)
    if (!milestone) {
      result.skipped++
      continue
    }
    const owner = await getClinicOwnerContact(row.organizationId)
    if (!owner) {
      // No billing contact yet — leave it unrecorded so it retries once one exists.
      result.skipped++
      continue
    }
    // CLAIM, then send. The JS check above is a cheap filter, not the guard —
    // the guard is this statement, and a run that loses the race skips.
    let owned: boolean
    try {
      owned = await claimTrialMilestone(row.organizationId, milestone)
    } catch (err) {
      console.warn('[billing-notifications] milestone claim failed for', row.organizationId, err)
      result.failed++
      continue
    }
    if (!owned) {
      // A concurrent run already holds this milestone. Not an error.
      result.skipped++
      continue
    }

    try {
      await sendTrialReminderEmail(owner.email, {
        firstName: owner.name,
        milestone: milestone as TrialEmailMilestone,
        billingUrl: billingUrl(row.pendingPlanId),
      })
      result.sent++
    } catch (err) {
      console.warn('[billing-notifications] trial reminder failed for', row.organizationId, err)
      await releaseTrialMilestone(row.organizationId, milestone).catch((releaseErr) => {
        // Nothing left to do but say so: the milestone stays stamped and this
        // clinic misses this one reminder. Louder than the send failure,
        // because it is the one that does not self-heal.
        console.error(
          '[billing-notifications] could not release milestone',
          milestone,
          'for',
          row.organizationId,
          releaseErr,
        )
      })
      result.failed++
    }
  }

  return result
}

/**
 * Dunning email to the clinic owner when a subscription invoice fails. Resolved
 * by the Stripe customer id (what the webhook has). Best-effort — callers wrap
 * it so it can never break the webhook.
 */
export async function sendPaymentFailedEmailForCustomer(
  stripeCustomerId: string,
  amountLabel: string,
): Promise<void> {
  const [profile] = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      pendingPlanId: schema.clinicProfile.pendingPlanId,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.stripeCustomerId, stripeCustomerId))
    .limit(1)
  if (!profile?.organizationId) return
  const owner = await getClinicOwnerContact(profile.organizationId)
  if (!owner) return
  await sendBillingPastDueEmail(owner.email, {
    firstName: owner.name,
    amountLabel,
    billingUrl: billingUrl(profile.pendingPlanId),
  })
}
