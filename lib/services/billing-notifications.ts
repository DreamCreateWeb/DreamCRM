import 'server-only'
import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveTrialState, dueTrialReminder, hasCardOnFileTrial, trialReminderKind } from '@/lib/trial'
import {
  sendTrialReminderEmail,
  sendTrialStartedEmail,
  sendBillingPastDueEmail,
  type TrialEmailMilestone,
} from '@/lib/email'
import { resolveClinicTimeZone } from '@/lib/clinic-timezone'
import { formatClinicDate } from '@/lib/format-datetime'

/**
 * Billing comms TO the clinic owner (not patient-facing): the trial reminder
 * sweep (cron), the trial-started welcome and the failed-payment dunning
 * email (both from the Stripe webhook). All are platform-identity sends and
 * ALWAYS reach the owner — they're billing-critical, so they deliberately
 * bypass the optional in-app notification preferences.
 *
 * TWO TRIALS, TWO SETS OF WORDS (lib/trial.ts). A no-card trial is asked for
 * a card before it runs out. A trial with the card on file is told the day it
 * is charged and how to cancel first — and is never asked for anything. A
 * signup that has not added its card has no trial and gets no reminder.
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
 * Email every trialing clinic whose next reminder milestone is due and hasn't
 * been sent yet, then RECORD the milestone so a re-run never re-emails it.
 * Which milestones exist depends on the trial (`dueTrialReminder`): a no-card
 * trial hears at 3 days, 1 day and ended; a card-on-file trial hears a week
 * out and the day before its card is charged. Best-effort per clinic (one
 * failure never aborts the sweep). Bounded by a time window so the query never
 * scans the whole customer base. Meant to run a few times a day via cron.
 */
export async function sendDueTrialReminders(now: Date = new Date()): Promise<TrialReminderSweepResult> {
  // Only clinics within ~a week of the end (where the earliest reminder, the
  // card-on-file week-out notice, fires) and up to 30 days past it (so a
  // just-expired no-card clinic still gets the 'ended' note, but we don't
  // re-scan ancient rows forever). A signup awaiting its card has no end date
  // and never enters the scan.
  const upper = new Date(now.getTime() + 7.5 * DAY_MS)
  const lower = new Date(now.getTime() - 30 * DAY_MS)

  const rows = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      trialEndsAt: schema.clinicProfile.trialEndsAt,
      subscriptionStatus: schema.clinicProfile.subscriptionStatus,
      stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      pendingPlanId: schema.clinicProfile.pendingPlanId,
      trialRemindersSent: schema.clinicProfile.trialRemindersSent,
      timezone: schema.clinicProfile.timezone,
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
    const milestone = dueTrialReminder(state.daysLeft, state.expired, sent, trialReminderKind(state))
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
        // A card-on-file trial is told the DAY, in the clinic's own calendar
        // (the server is UTC; a charge late on the 7th Central is already the
        // 8th here). `trialEndsAt` mirrors Stripe's `trial_end`.
        ...(state.cardOnFile && row.trialEndsAt
          ? { cardOnFile: { chargeDate: formatClinicDate(row.trialEndsAt, resolveClinicTimeZone(row.timezone)) } }
          : {}),
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

/** The welcome's own key in `trial_reminders_sent` — one per clinic, ever. */
const TRIAL_STARTED_MILESTONE = 'started'

/**
 * THE WELCOME, ONCE: "your free trial has started", sent when a signup adds
 * its card and Stripe opens the trial. Called from the Stripe webhook on
 * `checkout.session.completed`, after the subscription sync.
 *
 * Why it is safe to call from a webhook Stripe may deliver twice, and from
 * any other place that later wants to: it only sends for a clinic that IS on
 * a card-on-file trial right now, and it takes the same one-statement claim
 * the reminder sweep takes — the 'started' key is appended to
 * `trial_reminders_sent` under a not-already-there predicate, so exactly one
 * caller gets a row back. A send that fails hands the claim back for the
 * next delivery. Never throws: mail must not fail a billing webhook.
 */
export async function sendTrialStartedEmailOnce(
  organizationId: string,
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const [row] = await db
      .select({
        trialEndsAt: schema.clinicProfile.trialEndsAt,
        subscriptionStatus: schema.clinicProfile.subscriptionStatus,
        stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
        displayName: schema.clinicProfile.displayName,
        timezone: schema.clinicProfile.timezone,
        slug: schema.organization.slug,
      })
      .from(schema.clinicProfile)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    // Only a trial that actually has the card on file is welcomed: a checkout
    // by a clinic that was charged today (a no-card trial choosing its plan,
    // a resubscribe) is not the start of anything.
    if (!row || !hasCardOnFileTrial(row)) return 'skipped'
    const owner = await getClinicOwnerContact(organizationId)
    if (!owner) return 'skipped'

    const claimed = await db
      .update(schema.clinicProfile)
      .set({ trialRemindersSent: appendMilestone(TRIAL_STARTED_MILESTONE) })
      .where(
        and(
          eq(schema.clinicProfile.organizationId, organizationId),
          milestoneNotYetSent(TRIAL_STARTED_MILESTONE),
        ),
      )
      .returning({ organizationId: schema.clinicProfile.organizationId })
    if (claimed.length === 0) return 'skipped'

    try {
      const siteDomain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'
      await sendTrialStartedEmail(owner.email, {
        firstName: (owner.name || '').split(' ')[0] || null,
        clinicName: row.displayName || 'Your practice',
        chargeDate: row.trialEndsAt
          ? formatClinicDate(row.trialEndsAt, resolveClinicTimeZone(row.timezone))
          : null,
        websiteHubUrl: `${APP_URL}/website`,
        siteUrl: row.slug ? `https://${row.slug}.${siteDomain}` : null,
      })
      return 'sent'
    } catch (err) {
      console.warn('[billing-notifications] trial-started email failed for', organizationId, err)
      try {
        await db
          .update(schema.clinicProfile)
          .set({ trialRemindersSent: removeMilestone(TRIAL_STARTED_MILESTONE) })
          .where(eq(schema.clinicProfile.organizationId, organizationId))
      } catch (releaseErr) {
        console.error('[billing-notifications] could not release the trial-started claim', organizationId, releaseErr)
      }
      return 'failed'
    }
  } catch (err) {
    console.warn('[billing-notifications] trial-started email skipped for', organizationId, err)
    return 'failed'
  }
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
