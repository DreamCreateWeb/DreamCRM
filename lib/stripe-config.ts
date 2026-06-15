export type PlanId = 'basic' | 'pro' | 'premium'
export type BillingInterval = 'monthly' | 'annual'

export interface Plan {
  id: PlanId
  name: string
  price: number
  annualPrice: number
  color: string
  features: string[]
  priceIds: Record<BillingInterval, string>
}

export const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 99,
    annualPrice: 990,
    color: 'green',
    features: [
      'Beautiful clinic website on your own address',
      'Edit-in-place Website Studio — change anything yourself',
      'AI copy assistant for your site',
      'Contact + insurance-check requests straight to you',
      'SEO foundations: sitemap, social cards, local schema',
    ],
    priceIds: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
      annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 149,
    annualPrice: 1490,
    color: 'sky',
    features: [
      'Everything in Basic',
      'Online booking with your live availability',
      'Patient records, appointments agenda & reminders',
      'Website leads queue + unified patient messages',
      'Digital intake forms',
      'Clinic-branded patient portal',
      'Reviews collection + website testimonials',
      'Blog + SEO dashboard',
    ],
    priceIds: {
      monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? '',
      annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL ?? '',
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    annualPrice: 1990,
    color: 'violet',
    features: [
      'Everything in Pro',
      'Recall & outreach campaigns',
      'Practice analytics',
      'Online shop + membership plans (payouts to your bank)',
      'Careers page + applicant tracking',
      'PMS integration — Open Dental, two-way',
      'Priority support',
    ],
    priceIds: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
      annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL ?? '',
    },
  },
]

export function getPlanByPriceId(priceId: string): { plan: Plan; interval: BillingInterval } | undefined {
  for (const plan of PLANS) {
    if (plan.priceIds.monthly === priceId) return { plan, interval: 'monthly' }
    if (plan.priceIds.annual === priceId) return { plan, interval: 'annual' }
  }
  return undefined
}

export function getPlanById(id: PlanId): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}

// ── Social-connection add-on (Zernio social module, Phase 3) ─────────────────
//
// A FLAT per-tier subscription-item SKU that RAISES the social-connection cap
// (NOT metered per connection). Only Pro + Premium can buy it (Basic has no
// social allotment at all). Annual clinics get an annual add-on (10× monthly =
// 2 months free) matching their plan interval. The cap math lives in
// `lib/types/social-entitlements.ts`; THIS maps a (tier, interval) → its Stripe
// Price id.
//
// ⚠️ These Stripe Prices DO NOT EXIST yet — they're referenced lazily via env
// so `next build` + tests run keyless. Until the 4 env vars are set in
// `dreamcrm/app-secrets`, the add-on degrades gracefully to a disabled "coming
// soon" CTA (see `socialAddonConfigured` + the Settings card). Out-of-band
// setup (do this once, then redeploy):
//   1. Create a Stripe Product "Social connections — Pro" with two recurring
//      prices: $30/mo + $300/yr. → STRIPE_PRICE_SOCIAL_ADDON_PRO (monthly) +
//      STRIPE_PRICE_SOCIAL_ADDON_PRO_ANNUAL.
//   2. Create a Stripe Product "Social connections — Premium" with $20/mo +
//      $200/yr. → STRIPE_PRICE_SOCIAL_ADDON_PREMIUM +
//      STRIPE_PRICE_SOCIAL_ADDON_PREMIUM_ANNUAL.
//   3. Add all four price ids to the `dreamcrm/app-secrets` Secrets Manager
//      JSON and redeploy (App Runner reads secrets at startup).
//
// We key the env lookup off the PAID tiers only — `basic` has no add-on, so it
// maps to '' for both intervals (callers gate on tier first via
// `socialAddonAvailable`, so basic never reaches here in practice).
export const SOCIAL_ADDON_PRICE_IDS: Record<PlanId, Record<BillingInterval, string>> = {
  basic: { monthly: '', annual: '' },
  pro: {
    monthly: process.env.STRIPE_PRICE_SOCIAL_ADDON_PRO ?? '',
    annual: process.env.STRIPE_PRICE_SOCIAL_ADDON_PRO_ANNUAL ?? '',
  },
  premium: {
    monthly: process.env.STRIPE_PRICE_SOCIAL_ADDON_PREMIUM ?? '',
    annual: process.env.STRIPE_PRICE_SOCIAL_ADDON_PREMIUM_ANNUAL ?? '',
  },
}

/**
 * The Stripe Price id for the social add-on at this (plan, interval), or '' when
 * the tier has no add-on (basic) OR the env var isn't set yet. Callers MUST
 * treat '' as "not available" (the Stripe prices don't exist yet).
 */
export function getSocialAddonPriceId(planId: PlanId, interval: BillingInterval): string {
  return SOCIAL_ADDON_PRICE_IDS[planId]?.[interval] ?? ''
}

/** True when EVERY social-add-on Stripe price is configured (env present). The
 *  Settings CTA disables itself ("coming soon") until this is true. */
export function socialAddonConfigured(): boolean {
  return (
    Boolean(SOCIAL_ADDON_PRICE_IDS.pro.monthly) &&
    Boolean(SOCIAL_ADDON_PRICE_IDS.pro.annual) &&
    Boolean(SOCIAL_ADDON_PRICE_IDS.premium.monthly) &&
    Boolean(SOCIAL_ADDON_PRICE_IDS.premium.annual)
  )
}

/** Reverse lookup: is this Stripe Price id one of the social-add-on SKUs?
 *  Used by the webhook to detect the add-on on a subscription's items. Ignores
 *  empty env values so an unset price can never match a real one. */
export function isSocialAddonPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false
  for (const tier of Object.values(SOCIAL_ADDON_PRICE_IDS)) {
    if (tier.monthly && tier.monthly === priceId) return true
    if (tier.annual && tier.annual === priceId) return true
  }
  return false
}
