import 'server-only'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import {
  getSocialAddonPriceId,
  isSocialAddonPriceId,
  socialAddonConfigured,
  type BillingInterval,
  type PlanId,
} from '@/lib/stripe-config'
import { socialAddonAvailable, socialConnectionLimit } from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'

/**
 * Social-connection add-on billing + entitlement enforcement (Zernio social
 * module, Phase 3 PR 1). The add-on is a FLAT per-tier Stripe subscription
 * ITEM layered on top of the clinic's plan that raises the social-connection
 * cap (Pro 1→3, Premium 2→5). GBP is free + separate on every tier and is
 * NEVER counted or blocked here.
 *
 * Source of truth: `clinic_profile.social_addon` (0|1), kept in sync by the
 * Stripe webhook (which detects the add-on price among a subscription's items).
 * These functions DRIVE Stripe (add/remove the item) and rely on the webhook to
 * persist the flag — but `addSocialAddon` also writes the flag optimistically so
 * the Settings UI reflects the purchase immediately (the webhook reconciles it
 * regardless, idempotently).
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The clinic_profile billing columns we read to drive add-on changes. */
async function loadProfile(orgId: string): Promise<{
  planTier: PlanTier
  stripeSubscriptionId: string | null
  billingMode: string | null
  socialAddon: boolean
} | null> {
  const [row] = await db
    .select({
      planTier: schema.clinicProfile.planTier,
      stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      billingMode: schema.clinicProfile.billingMode,
      socialAddon: schema.clinicProfile.socialAddon,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (!row) return null
  return {
    planTier: (row.planTier as PlanTier | null) ?? 'basic',
    stripeSubscriptionId: row.stripeSubscriptionId,
    billingMode: row.billingMode,
    socialAddon: row.socialAddon === 1,
  }
}

/** Resolve a live subscription's billing interval from its plan item's price
 *  recurrence ('year' → annual, else monthly). Defaults monthly. */
function intervalFromSubscription(sub: {
  items?: { data?: Array<{ price?: { recurring?: { interval?: string | null } | null } | null }> }
}): BillingInterval {
  for (const item of sub.items?.data ?? []) {
    const interval = item?.price?.recurring?.interval
    if (interval === 'year') return 'annual'
    if (interval === 'month') return 'monthly'
  }
  return 'monthly'
}

/** Set (or clear) the persisted add-on flag for an org. Idempotent. */
export async function setSocialAddonFlag(orgId: string, active: boolean): Promise<void> {
  await db
    .update(schema.clinicProfile)
    .set({
      socialAddon: active ? 1 : 0,
      // Stamp the activation time on turn-on; clear it on turn-off.
      socialAddonSince: active ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, orgId))
}

// ── Purchase ─────────────────────────────────────────────────────────────────

/**
 * Add the social-connection add-on for a clinic: add a Stripe subscription ITEM
 * for the add-on price matching the clinic's tier + billing interval, with
 * proration. Idempotent — adding when an add-on item already exists is a no-op.
 *
 * Throws a clear error when:
 *  - the tier can't buy it (basic → "Upgrade to Pro …"),
 *  - the prices aren't configured yet (env unset → "coming soon"),
 *  - there's no active Stripe subscription (comped/managed → "managed billing").
 */
export async function addSocialAddon(orgId: string): Promise<void> {
  const profile = await loadProfile(orgId)
  if (!profile) throw new Error('No clinic profile found.')

  if (!socialAddonAvailable(profile.planTier)) {
    throw new Error('The social-connections add-on is available on Pro and Premium. Upgrade to Pro to add social connections.')
  }
  if (!socialAddonConfigured()) {
    throw new Error('The social-connections add-on is coming soon — it isn’t available to purchase yet.')
  }
  if (!profile.stripeSubscriptionId) {
    // No subscription to attach the add-on item to. Two distinct cases with
    // different next steps: managed/comped is billed by us (contact us); a
    // self-serve clinic on the no-card trial just needs to start their plan.
    if (profile.billingMode === 'managed' || profile.billingMode === 'comped') {
      throw new Error('Your plan is on managed billing — contact us to add social connections.')
    }
    throw new Error('Start your plan first (Settings → Plan & billing) — the add-on attaches to your subscription.')
  }

  // Reconcile the add-on item against the CURRENT tier + interval. This both
  // adds the item when absent AND corrects it if the clinic changed tiers while
  // holding the add-on (a Pro add-on item on a now-Premium sub gets swapped).
  await reconcileSocialAddonItem(orgId, true)
}

/**
 * Remove the social-connection add-on: find + delete the add-on subscription
 * item (with proration). Idempotent — removing when no add-on item exists is a
 * no-op. Best-effort on the flag (the webhook also clears it on the resulting
 * subscription.updated event).
 */
export async function removeSocialAddon(orgId: string): Promise<void> {
  const profile = await loadProfile(orgId)
  if (!profile) throw new Error('No clinic profile found.')
  if (!profile.stripeSubscriptionId) {
    // No subscription → nothing to remove. Make sure the flag is off and return.
    if (profile.socialAddon) await setSocialAddonFlag(orgId, false)
    return
  }
  await reconcileSocialAddonItem(orgId, false)
}

/**
 * THE reconcile primitive: make the clinic's Stripe subscription items reflect
 * `desiredActive` for the add-on at the clinic's CURRENT tier + interval.
 *
 * - desiredActive=true: ensure exactly one add-on item, on the price matching
 *   (tier, interval). If a stale add-on item exists on a DIFFERENT price (tier
 *   changed), it's swapped. No-op when already correct.
 * - desiredActive=false: delete every add-on item present. No-op when none.
 *
 * Persists the flag to match. Safe to call from the webhook on a plan change to
 * keep the add-on item in lockstep with the plan tier.
 */
export async function reconcileSocialAddonItem(orgId: string, desiredActive: boolean): Promise<void> {
  const profile = await loadProfile(orgId)
  if (!profile?.stripeSubscriptionId) return

  const sub = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId, {
    expand: ['items.data.price'],
  })

  const addonItems = (sub.items?.data ?? []).filter((it) =>
    isSocialAddonPriceId(it.price?.id),
  )

  if (!desiredActive) {
    // Drop every add-on item, then clear the flag.
    for (const it of addonItems) {
      await stripe.subscriptionItems.del(it.id, { proration_behavior: 'create_prorations' })
    }
    await setSocialAddonFlag(orgId, false)
    return
  }

  // desiredActive — target price for the current tier + interval.
  const interval = intervalFromSubscription(sub)
  const wantedPriceId = getSocialAddonPriceId(profile.planTier as PlanId, interval)
  if (!wantedPriceId) {
    // Tier can't have the add-on (e.g. dropped to basic) — treat as remove.
    for (const it of addonItems) {
      await stripe.subscriptionItems.del(it.id, { proration_behavior: 'create_prorations' })
    }
    await setSocialAddonFlag(orgId, false)
    return
  }

  const correct = addonItems.find((it) => it.price?.id === wantedPriceId)
  const stale = addonItems.filter((it) => it.price?.id !== wantedPriceId)

  // Remove any stale add-on items (wrong tier price after a plan change).
  for (const it of stale) {
    await stripe.subscriptionItems.del(it.id, { proration_behavior: 'create_prorations' })
  }

  if (!correct) {
    await stripe.subscriptionItems.create({
      subscription: profile.stripeSubscriptionId,
      price: wantedPriceId,
      quantity: 1,
      proration_behavior: 'create_prorations',
    })
  }

  await setSocialAddonFlag(orgId, true)
}

// ── Cap enforcement (consumed by PR 2's connect flow) ────────────────────────

export interface SocialConnectCheck {
  allowed: boolean
  /** The clinic's social-connection cap (non-GBP) at its plan + add-on state. */
  limit: number
  /** How many non-GBP social accounts are currently connected. */
  current: number
  /** When not allowed, a friendly reason (upgrade / buy add-on). */
  reason?: string
}

/**
 * Whether the clinic can connect ANOTHER social (non-GBP) platform. Counts
 * current non-GBP `zernio_account` rows for the org against
 * `socialConnectionLimit(plan, addon)`. GBP is NEVER counted and NEVER blocked
 * (it has its own free, separate allowance on every tier).
 *
 * Ready for PR 2 to gate the multi-platform connect flow — this PR ships + tests
 * the helper but does not yet wire it to a connect UI (social-connect is PR 2).
 */
export async function canConnectSocialPlatform(orgId: string): Promise<SocialConnectCheck> {
  const profile = await loadProfile(orgId)
  const planTier: PlanTier = profile?.planTier ?? 'basic'
  const hasAddon = profile?.socialAddon ?? false
  const limit = socialConnectionLimit(planTier, hasAddon)

  // Count connected accounts that are NOT Google Business — GBP doesn't count.
  const rows = await db
    .select({ id: schema.zernioAccount.id })
    .from(schema.zernioAccount)
    .where(
      and(
        eq(schema.zernioAccount.organizationId, orgId),
        ne(schema.zernioAccount.platform, 'googlebusiness'),
      ),
    )
  const current = rows.length

  if (current >= limit) {
    let reason: string
    if (limit === 0) {
      reason = 'Your plan doesn’t include social connections yet. Upgrade to Pro to connect a social account.'
    } else if (socialAddonAvailable(planTier)) {
      reason = `You’ve used all ${limit} of your social connections. Add the social-connections add-on for more.`
    } else {
      reason = `You’ve reached your limit of ${limit} social connections.`
    }
    return { allowed: false, limit, current, reason }
  }
  return { allowed: true, limit, current }
}

// ── Demo seeding ─────────────────────────────────────────────────────────────

/**
 * Seed the demo clinic's social add-on flag = 1 (the demo is Premium → 5 social
 * slots) so PR 2's social UI showcases the full allotment. Idempotent — no-op
 * once already on. Patient-guarded (mirrors seedDemoZernio) + scoped to the
 * isDemo org by the caller. NEVER touches Stripe (the demo has no real sub).
 */
export async function seedDemoSocialAddon(organizationId: string): Promise<void> {
  const [anyPatient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
    .limit(1)
  if (!anyPatient) return

  const [row] = await db
    .select({ socialAddon: schema.clinicProfile.socialAddon })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!row) return
  if (row.socialAddon === 1) return // already seeded

  await setSocialAddonFlag(organizationId, true)
}
