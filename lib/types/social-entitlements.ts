/**
 * Social-connection entitlements — the client-safe MATH for the Zernio social
 * module's billing. NO `server-only` here: imported by the server services
 * (`lib/services/social-billing.ts`, the Stripe webhook) AND the React Settings
 * UI, so keep it free of any server imports or secrets.
 *
 * Product spec (FINALIZED 2026-06-15 — see docs/zernio-google-integration.md):
 *
 *   Plan          | GBP | Free social | Social add-on | Social limit (base → +addon)
 *   --------------|-----|-------------|---------------|----------------------------
 *   Basic ($99)   |  ✓  |     0       | not available |  0
 *   Pro ($149)    |  ✓  |     1       |   $30/mo      |  1 → 3
 *   Premium ($199)|  ✓  |     2       |   $20/mo      |  2 → 5
 *
 * GBP is FREE + SEPARATE on every tier — it does NOT count toward the social
 * limit and is never blocked (see {@link GBP_ALLOWED_ALL_PLANS}). "Total
 * connections including GBP" = social limit + 1 → Basic 1, Pro 2/4, Premium 3/6.
 *
 * The add-on is a FLAT per-tier SKU that raises the cap (NOT metered per
 * connection): Pro $30/mo, Premium $20/mo. Annual clinics get an annual add-on
 * (10× monthly = 2 months free) matching their plan interval.
 */

import type { PlanTier } from '@/lib/modules/types'

/**
 * Google Business is connectable + usable on EVERY plan tier (Basic included),
 * free, and never counts against the social limit. A named constant so call
 * sites read intent (`if (GBP_ALLOWED_ALL_PLANS) …`) and a future change is one
 * edit. There is no tier below which GBP is gated — owner/admin role is the only
 * requirement, enforced at the action/route layer.
 */
export const GBP_ALLOWED_ALL_PLANS = true as const

/** Base (no add-on) free social connections per plan tier. */
const BASE_SOCIAL_LIMIT: Record<PlanTier, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
}

/** With the add-on active, the raised social cap per plan tier. */
const ADDON_SOCIAL_LIMIT: Record<PlanTier, number> = {
  basic: 0, // Basic can't buy the add-on — staying 0 keeps the math honest.
  pro: 3,
  premium: 5,
}

/** Flat monthly price (cents) of the social add-on per tier. null = unavailable. */
const SOCIAL_ADDON_PRICE_CENTS: Record<PlanTier, number | null> = {
  basic: null,
  pro: 3000, // $30/mo
  premium: 2000, // $20/mo
}

/**
 * How many SOCIAL (non-GBP) platform connections this clinic is entitled to.
 * GBP is never included in this number. Basic is always 0 (the add-on isn't
 * available, so `hasSocialAddon` is ignored for Basic — the math returns the
 * base 0 either way).
 */
export function socialConnectionLimit(planTier: PlanTier, hasSocialAddon: boolean): number {
  return hasSocialAddon ? ADDON_SOCIAL_LIMIT[planTier] : BASE_SOCIAL_LIMIT[planTier]
}

/** Whether the social add-on can be purchased on this plan (false for Basic). */
export function socialAddonAvailable(planTier: PlanTier): boolean {
  return SOCIAL_ADDON_PRICE_CENTS[planTier] !== null
}

/** Flat monthly add-on price (cents) for this plan, or null when unavailable. */
export function socialAddonPriceCents(planTier: PlanTier): number | null {
  return SOCIAL_ADDON_PRICE_CENTS[planTier]
}

/**
 * "Total connections including GBP" = social limit + 1 (GBP is always allowed).
 * Basic 1, Pro 2 (→4 with add-on), Premium 3 (→6 with add-on). Surfaced in the
 * Settings copy so the clinic sees the full picture, GBP included.
 */
export function totalConnectionLimitIncludingGbp(planTier: PlanTier, hasSocialAddon: boolean): number {
  return socialConnectionLimit(planTier, hasSocialAddon) + 1
}
