/**
 * Feature BUNDLES — the product framing layered over the integration CATALOG.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  WHY a bundle layer on top of the catalog
 * ────────────────────────────────────────────────────────────────────────────
 *  The catalog (`catalog.ts`) is a flat list of individual third-party accounts
 *  (Open Dental, Instagram, Gmail, Stripe, …). A clinic doesn't think in
 *  accounts — it thinks in CAPABILITIES: "I want my Google presence handled",
 *  "I want to sell things", "I want my PMS synced". A BUNDLE groups the catalog's
 *  integrations into one of those capabilities, carries the pricing framing
 *  (included in the plan vs a paid add-on), and — crucially — is what makes an
 *  integration's features feel BUILT-IN: when a bundle is active, its feature
 *  pages surface in the sidebar alongside the core CRM (see `requiresBundle` on
 *  `ModuleDef` + `applyBundleGate` in `lib/modules`).
 *
 *  A bundle OWNS one or more catalog CATEGORIES — so its member integrations are
 *  derived from the catalog (`bundleMembers`), NOT hand-listed. Adding a new
 *  social integration to the catalog auto-joins the Social bundle; the contract
 *  "adding an integration is a data change" carries straight through.
 *
 *  CLIENT-SAFE + PURE (no `server-only`, no secrets, no `lib/modules` import — it
 *  must not create a cycle, since `lib/modules/types` imports `BundleId` from
 *  here). Live "is this bundle active for this clinic?" is computed from a small
 *  `BundleSignals` the caller assembles — the SIDEBAR builds it from cheap
 *  queries (`lib/services/integration-bundles.ts`); the `/integrations` page
 *  builds it from the live state it already loads.
 *
 *  HONESTY RULE (CLAUDE.md): only real bundles + clearly-labelled roadmap. No
 *  fabricated capabilities to look big.
 */

import { INTEGRATIONS_CATALOG, type IntegrationCategory, type IntegrationDef } from './catalog'
import type { BrandLogoId } from '@/components/integrations/brand-logos'

/** Stable bundle ids. Referenced by `ModuleDef.requiresBundle` for sidebar wiring. */
export type BundleId = 'pms' | 'google' | 'social' | 'communication' | 'payments'

/** A "where this shows up in DreamCRM" link on a bundle card. */
export interface BundleValueLink {
  href: string
  label: string
}

/**
 * One feature bundle — the capability a clinic activates by connecting the
 * accounts inside it. PURE STATIC METADATA; live active-state is derived
 * separately (see {@link BundleSignals} / {@link activeBundleIds}).
 */
export interface BundleDef {
  /** Stable id (unique). */
  id: BundleId
  /** Human name shown on the bundle card + section header. */
  name: string
  /** One-liner under the name. */
  tagline: string
  /** Longer "what you get" description. */
  description: string
  /** The catalog categories whose integrations belong to this bundle. Members
   *  are derived from the catalog by these categories — never hand-listed. */
  categories: IntegrationCategory[]
  /** Whole-bundle lifecycle (every bundle today is `live`). */
  availability: 'live' | 'coming_soon'
  /**
   * The plan tier needed to USE this bundle (Premium for PMS + Ecommerce; Pro
   * for Social). Omit = available on every plan (Google, Communications). Kept a
   * local literal (not `PlanTier` from lib/modules) to avoid an import cycle.
   */
  minPlan?: 'basic' | 'pro' | 'premium'
  /** True when a paid add-on lives INSIDE the bundle (Social's cap upsell). */
  hasPaidAddon?: boolean
  /** A deep setup / management page, when one exists (PMS, Google Business). */
  detailHref?: string
  /** Where this bundle's features surface in DreamCRM (the "built-in" links). */
  valueLinks?: BundleValueLink[]
  /** A short "what's included / what it costs" note for the card. */
  note?: string
}

// ── THE BUNDLES ──────────────────────────────────────────────────────────────
//
// Five real capability bundles over today's catalog. Order = the display order
// on /integrations (practice-critical first, then growth, comms, commerce).

export const BUNDLES: BundleDef[] = [
  {
    id: 'pms',
    name: 'Practice Management',
    tagline: 'Sync patients, appointments, providers & balances with your PMS.',
    description:
      "Two-way sync with your practice-management system through its official API, so DreamCRM rides your real schedule and balances — and every record we create lands in your PMS's audit trail. We wrap what you already run; we never replace it.",
    categories: ['pms'],
    availability: 'live',
    minPlan: 'premium',
    detailHref: '/integrations/open-dental',
    valueLinks: [
      { href: '/patients', label: 'Patients' },
      { href: '/appointments', label: 'Appointments' },
    ],
    note: 'Included with Premium. Two-way, audit-clean — official APIs only.',
  },
  {
    id: 'google',
    name: 'Google Business',
    tagline: 'Reviews, verified hours, photos, posts & local search performance.',
    description:
      'Connect your Google Business Profile once and DreamCRM pulls your real reviews (with one-click replies and a legit star rating on your site), your verified hours, address, phone, and photos, and your local search performance — and lets you publish Google posts from the composer.',
    categories: ['google'],
    availability: 'live',
    detailHref: '/integrations/google-business',
    valueLinks: [
      { href: '/reviews/received', label: 'Reviews' },
      { href: '/seo', label: 'Local search' },
      { href: '/social-posts', label: 'Posts' },
    ],
    note: 'Free on every plan. Never counts toward your social connections.',
  },
  {
    id: 'social',
    name: 'Social Media',
    tagline: 'Connect Instagram, Facebook, TikTok, YouTube & LinkedIn — post from one place.',
    description:
      'Connect the social accounts you post to and publish or schedule to all of them from one composer, with per-platform performance in Analytics. Your plan includes a set number of connections; a flat add-on raises the cap whenever you need more.',
    categories: ['social'],
    availability: 'live',
    minPlan: 'pro',
    hasPaidAddon: true,
    valueLinks: [
      { href: '/social-posts', label: 'Social Posts' },
      { href: '/analytics', label: 'Performance' },
    ],
    note: 'Pro & up. Plan includes some connections; add more any time.',
  },
  {
    id: 'communication',
    name: 'Patient Communications',
    tagline: 'Bring your practice email into one inbox. Texting on the way.',
    description:
      'Connect your practice Gmail so clinic-bound email lands in DreamCRM, you can reply in-thread, and patient email sends from your own address. Two-way SMS for reminders, recall, and review requests is genuinely on the roadmap.',
    categories: ['communication'],
    availability: 'live',
    valueLinks: [
      { href: '/inbox', label: 'Inbox' },
      { href: '/messages', label: 'Messages' },
    ],
    note: 'Gmail is live on every plan; SMS is on the roadmap.',
  },
  {
    id: 'payments',
    name: 'Ecommerce & Payments',
    tagline: 'Take payments for your shop, memberships & balances — payouts to your bank.',
    description:
      'Connect your own Stripe account so storefront orders, membership subscriptions, and online balance payments are charged on your account and paid out to your bank. DreamCRM never holds your money. Opens your branded shop + membership plans.',
    categories: ['payments'],
    availability: 'live',
    minPlan: 'premium',
    detailHref: '/shop',
    valueLinks: [{ href: '/shop', label: 'Shop' }],
    note: 'Included with Premium. Connect your own Stripe — payouts to your bank.',
  },
]

/** Display order of the bundle ids. */
export const BUNDLE_ORDER: BundleId[] = BUNDLES.map((b) => b.id)

/** Bundle lookup by id. */
export const BUNDLE_BY_ID: Record<BundleId, BundleDef> = Object.fromEntries(BUNDLES.map((b) => [b.id, b])) as Record<
  BundleId,
  BundleDef
>

// ── Catalog ↔ bundle mapping (members derived from the catalog) ───────────────

/** The bundle that owns a catalog category, or null when no bundle claims it. */
export function bundleForCategory(category: IntegrationCategory): BundleId | null {
  return BUNDLES.find((b) => b.categories.includes(category))?.id ?? null
}

/** The bundle a catalog integration belongs to (via its category), or null. */
export function bundleForIntegration(def: IntegrationDef): BundleId | null {
  return bundleForCategory(def.category)
}

/** The catalog integrations that belong to a bundle (derived by category). */
export function bundleMembers(
  bundle: BundleDef,
  defs: readonly IntegrationDef[] = INTEGRATIONS_CATALOG,
): IntegrationDef[] {
  return defs.filter((d) => bundle.categories.includes(d.category))
}

/** Member brand-logo ids for a bundle's logo cluster (capped, de-duped, order-stable). */
export function bundleLogos(bundle: BundleDef, max = 5): BrandLogoId[] {
  const seen = new Set<BrandLogoId>()
  const out: BrandLogoId[] = []
  for (const m of bundleMembers(bundle)) {
    if (seen.has(m.logo)) continue
    seen.add(m.logo)
    out.push(m.logo)
    if (out.length >= max) break
  }
  return out
}

// ── Live active-state derive (pure) ──────────────────────────────────────────

/**
 * The minimal live signals needed to decide whether each bundle is ACTIVE for a
 * clinic. The caller assembles this from whatever it already knows — the sidebar
 * from cheap per-bundle queries, the /integrations page from its full live load.
 * A bundle is "active" when the clinic has CONNECTED something inside it (no
 * separate opt-in — see the activation model decision: auto-derived).
 */
export interface BundleSignals {
  /** A PMS (Open Dental / demo sandbox) connection is live. */
  pmsConnected: boolean
  /** A Google Business Profile is connected. */
  googleConnected: boolean
  /** At least one non-GBP social account is connected. */
  socialConnected: boolean
  /** A practice mailbox (Gmail) is connected. */
  communicationConnected: boolean
  /** Stripe Connect is engaged OR a shop/membership is already set up. */
  paymentsActive: boolean
}

/** Whether a single bundle is active for the clinic, given the live signals. */
export function isBundleActive(id: BundleId, s: BundleSignals): boolean {
  switch (id) {
    case 'pms':
      return s.pmsConnected
    case 'google':
      return s.googleConnected
    case 'social':
      return s.socialConnected
    case 'communication':
      return s.communicationConnected
    case 'payments':
      return s.paymentsActive
  }
}

/** The set of bundle ids active for a clinic — drives the sidebar feature gate. */
export function activeBundleIds(s: BundleSignals): Set<BundleId> {
  return new Set(BUNDLE_ORDER.filter((id) => isBundleActive(id, s)))
}
