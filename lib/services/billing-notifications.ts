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

/**
 * THE MILESTONE CLAIM, IN ONE STATEMENT.
 *
 * `trial_reminders_sent` is a jsonb array of milestone keys. Appending to it
 * from JavaScript (`[...sent, milestone]`) is a read-modify-write across a
 * cron that is at-least-once and can overlap itself, and it was happening
 * AFTER the email went out. Both halves of that hurt: two overlapping runs
 * both passed the in-JS `dueTrialReminder` check and both emailed, and a
 * send that succeeded followed by a stamp that failed re-emailed on the next
 * tick. A trial reminder arriving twice reads as a dunning notice from a
 * company that is not sure whether you paid.
 *
 * So the append and the not-already-sent test live in ONE statement. Postgres
 * takes the row lock for the UPDATE, re-evaluates the WHERE against the
 * committed row, and hands back a row to exactly one caller: the loser's
 * `returning()` is empty and it never sends. Same claim-row shape as the
 * scheduled-message flush, expressed against a jsonb array instead of a
 * status column.
 *
 * EVERY BOUND PARAMETER CARRIES A CAST. `jsonb ||` and `jsonb -` are both
 * overloaded, so an untyped `$n` fails at PARSE time with 42P18 — the whole
 * sweep, on every clinic, with nothing to see in a JS-mocked test. That trap
 * cost the autonomy write a production outage once already; see
 * `tests/journey/autonomy-sql.test.ts`, and the sibling boundary test here.
 */
function appendMilestone(milestone: string) {
  return sql`coalesce(${schema.clinicProfile.trialRemindersSent}, '[]'::jsonb) || ${JSON.stringify([milestone])}::jsonb`
}

/** True while this clinic's array does NOT already carry the milestone. */
function milestoneNotYetSent(milestone: string) {
  return sql`not (coalesce(${schema.clinicProfile.trialRemindersSent}, '[]'::jsonb) @> ${JSON.stringify([milestone])}::jsonb)`
}

/** Give the claim back so the next tick may retry it. */
function removeMilestone(milestone: string) {
  return sql`coalesce(${schema.clinicProfile.trialRemindersSent}, '[]'::jsonb) - ${milestone}::text`
}

/**
 * Email every trialing clinic whose next reminder milestone is due (3 days /
 * 1 day / ends-today / ended) and hasn't been sent yet, then RECORD the
 * milestone so a re-run never re-emails it. Best-effort per clinic (one
 * failure never aborts the sweep). Bounded by a time window so the query never
 * scans the whole customer base. Meant to run a few times a day via cron.
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
    // CLAIM, THEN SEND (see appendMilestone above). The `dueTrialReminder`
    // check a few lines up is a cheap pre-filter against a snapshot; THIS is
    // the authority. A run that loses the race sends nothing.
    let claimed: Array<{ organizationId: string }>
    try {
      claimed = await db
        .update(schema.clinicProfile)
        .set({ trialRemindersSent: appendMilestone(milestone) })
        .where(
          and(
            eq(schema.clinicProfile.organizationId, row.organizationId),
            milestoneNotYetSent(milestone),
          ),
        )
        .returning({ organizationId: schema.clinicProfile.organizationId })
    } catch (err) {
      console.warn('[billing-notifications] milestone claim failed for', row.organizationId, err)
      result.failed++
      continue
    }
    if (claimed.length === 0) {
      // Another run got there first, or the milestone was already recorded.
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
      result.failed++
      // Hand the claim back. A Resend blip must not cost the owner the
      // warning entirely — this is billing-critical mail, and the sweep runs
      // again in six hours. If the release itself fails we keep the stamp and
      // say so loudly: one lost reminder beats a claim nobody can clear.
      try {
        await db
          .update(schema.clinicProfile)
          .set({ trialRemindersSent: removeMilestone(milestone) })
          .where(eq(schema.clinicProfile.organizationId, row.organizationId))
      } catch (releaseErr) {
        console.error(
          '[billing-notifications] could not release the claimed milestone',
          row.organizationId,
          milestone,
          releaseErr,
        )
      }
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
