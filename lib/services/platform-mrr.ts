import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { listAdminSubscriptions, monthlyContributionCents } from './stripe-admin'

/**
 * THE recurring-revenue number, computed once.
 *
 * There used to be three copies of a hardcoded tier→price map — `clinics.ts`
 * and `projects.ts` said {basic 9900, pro 14900, premium 19900}, while
 * `platform-metrics.ts` said {basic 15000, pro 25000, premium 20000} with
 * premium priced BELOW pro. Two dashboards therefore reported different MRR
 * from the same tenants, and neither matched what anybody was charged.
 *
 * There is no price map here. The money comes from the clinic's live Stripe
 * subscription — the only thing that knows what a clinic actually pays, and
 * the same source `/ecommerce/invoices` already reads.
 *
 * The split of duties is deliberate:
 *
 *   - WHO COUNTS comes from our own database (`clinic_profile`): which clinic
 *     orgs exist, what tier we put them on, whether they are demo. Stripe has
 *     no opinion about a comped or platform-managed clinic.
 *   - WHAT THEY PAY comes from Stripe. A comped clinic has no subscription
 *     and contributes 0, which is the truth — the old constant credited it a
 *     tier price.
 */

export interface MrrSlice {
  /** Clinic orgs in this slice (never demo). */
  clinics: number
  /** Their combined recurring revenue, per month, from live Stripe amounts. */
  monthlyCents: number
  byTier: { basic: number; pro: number; premium: number }
}

export interface PlatformMrr {
  /** Recognized revenue: clinics we record as `active`. Paying customers. */
  recognized: MrrSlice
  /** Recognized plus clinics still inside a trial — the pipeline view. */
  withTrialing: MrrSlice
  /**
   * True when Stripe could not be reached. The CLINIC COUNTS above are still
   * real (they come from our database); every `monthlyCents` is 0 and means
   * "unknown", not "zero". Surfaces must say so rather than print the 0.
   */
  stripeUnavailable: boolean
  /** Live monthly cents per clinic org — for the Clinics list's own column. */
  monthlyCentsByOrg: Map<string, number>
}

function emptySlice(): MrrSlice {
  return { clinics: 0, monthlyCents: 0, byTier: { basic: 0, pro: 0, premium: 0 } }
}

export function emptyPlatformMrr(stripeUnavailable = false): PlatformMrr {
  return {
    recognized: emptySlice(),
    withTrialing: emptySlice(),
    stripeUnavailable,
    monthlyCentsByOrg: new Map(),
  }
}

/** "Already missing" Postgres error codes — a fresh environment has no tables yet. */
function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}

export async function getPlatformMrr(): Promise<PlatformMrr> {
  let clinics: Array<{
    orgId: string
    planTier: string | null
    subscriptionStatus: string | null
    stripeSubscriptionId: string | null
  }>
  try {
    clinics = await db
      .select({
        orgId: clinicProfile.organizationId,
        planTier: clinicProfile.planTier,
        subscriptionStatus: clinicProfile.subscriptionStatus,
        stripeSubscriptionId: clinicProfile.stripeSubscriptionId,
      })
      .from(clinicProfile)
      .innerJoin(organization, eq(clinicProfile.organizationId, organization.id))
      .where(
        and(
          eq(organization.isDemo, false),
          inArray(clinicProfile.subscriptionStatus, ['active', 'trialing']),
        ),
      )
  } catch (err) {
    if (isMissingSchema(err)) return emptyPlatformMrr()
    throw err
  }
  if (clinics.length === 0) return emptyPlatformMrr()

  // One Stripe read for every surface that needs a number. A failure here is
  // NOT fatal: the counts are still true and the caller renders the money as
  // unknown, which beats both crashing and printing a confident $0.
  let monthlyBySubscription = new Map<string, number>()
  let stripeUnavailable = false
  try {
    const subs = await listAdminSubscriptions()
    monthlyBySubscription = new Map(subs.map((s) => [s.id, monthlyContributionCents(s)]))
  } catch (err) {
    console.warn('[platform-mrr] could not read subscriptions from Stripe', err)
    stripeUnavailable = true
  }

  const recognized = emptySlice()
  const withTrialing = emptySlice()
  const monthlyCentsByOrg = new Map<string, number>()

  for (const c of clinics) {
    // A tier we do not recognise still counts as a clinic and still carries
    // its real Stripe amount — it just has no bucket to sit in.
    const tier =
      c.planTier === 'basic' || c.planTier === 'pro' || c.planTier === 'premium' ? c.planTier : null
    const monthly = c.stripeSubscriptionId
      ? monthlyBySubscription.get(c.stripeSubscriptionId) ?? 0
      : 0
    monthlyCentsByOrg.set(c.orgId, monthly)

    withTrialing.clinics += 1
    withTrialing.monthlyCents += monthly
    if (tier) withTrialing.byTier[tier] += 1

    if (c.subscriptionStatus === 'active') {
      recognized.clinics += 1
      recognized.monthlyCents += monthly
      if (tier) recognized.byTier[tier] += 1
    }
  }

  return { recognized, withTrialing, stripeUnavailable, monthlyCentsByOrg }
}
