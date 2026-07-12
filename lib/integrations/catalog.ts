/**
 * Integrations CATALOG / REGISTRY — the single source of truth for every
 * integration DreamCRM offers. Client-safe (no `server-only`, no secrets): it's
 * imported by both the server page (`app/(default)/integrations/page.tsx`) and
 * the React marketplace UI (`integrations-library.tsx`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  THE CONTRACT — adding an integration is a DATA change, not a JSX change.
 * ────────────────────────────────────────────────────────────────────────────
 *  We intend to grow this to HUNDREDS — eventually thousands — of integrations.
 *  So the marketplace renders ENTIRELY from this array. To add the 500th
 *  integration:
 *
 *    1. Append one `IntegrationDef` to `INTEGRATIONS_CATALOG` below (pick a
 *       `category`, a `logo` id, a tagline, keywords, an `availability` + a
 *       `connectKind`).
 *    2. Add its brand logo id to `components/integrations/brand-logos.tsx` (and
 *       a `BRAND_ACCENTS` entry) — the ONLY non-data step, and only if it's a
 *       new brand mark.
 *    3. If it's actually connectable, wire its connect handler (the runtime
 *       resolver maps `connectKind` → the right card affordance; today the
 *       connectable kinds are `zernio`, `pms`, and `oauth`/`external_link`).
 *
 *  That's it — no new card component, no new section, no edit to the grid. The
 *  card renders from the def; the runtime status is computed separately by the
 *  resolver (see `resolveCatalog` in `lib/integrations/resolve.ts`) so the
 *  catalog stays PURE metadata and scales cleanly.
 *
 *  HONESTY RULE (CLAUDE.md): every def is a REAL integration or a genuine
 *  roadmap item (clearly labelled via `availability`). We do NOT pad the catalog
 *  with fabricated integrations to look big — the ARCHITECTURE proves the scale;
 *  the CONTENT stays honest. Coming-soon / request-access tiles are fine (they
 *  label themselves), exactly like the roadmap PMSs.
 */

import type { BrandLogoId } from '@/components/integrations/brand-logos'

// ── Category taxonomy (scalable — add a category by adding a CATEGORY_META row) ─
//
// A small, workflow-shaped taxonomy that has room to grow. Each category is a
// section in the "All" view and a filter in the category nav. `order` controls
// section + filter ordering; `label` is the human name. To add a category:
// extend the union + add a CATEGORY_META row — nothing else changes.

export type IntegrationCategory =
  | 'pms'
  | 'google'
  | 'social'
  | 'communication'
  | 'payments'
  | 'marketing'
  | 'analytics'
  | 'scheduling'
  | 'forms'
  | 'other'

export interface CategoryMeta {
  id: IntegrationCategory
  /** Human label for section headers + the category filter. */
  label: string
  /** A one-line description of the category (used as the section blurb). */
  blurb: string
  /** Sort order across sections + the category nav (ascending). */
  order: number
}

/**
 * Metadata for every category. Categories with zero LIVE+roadmap defs still
 * declare themselves here so the taxonomy is stable as the catalog grows; the
 * UI only renders a category that actually has matching integrations, so an
 * empty category is invisible until something lands in it.
 */
export const CATEGORY_META: Record<IntegrationCategory, CategoryMeta> = {
  pms: {
    id: 'pms',
    label: 'Practice management',
    blurb:
      "Sync the relationship layer — patients, appointments, providers, balances — both directions through your PMS's official API. We never touch your database directly.",
    order: 1,
  },
  google: {
    id: 'google',
    label: 'Google',
    blurb:
      'Your reviews, verified hours, photos, and local search performance — through a secure sign-in (no Google verification paperwork on your end).',
    order: 2,
  },
  social: {
    id: 'social',
    label: 'Social',
    blurb:
      'Connect the social accounts you post to. Your plan sets how many — Google Business is always free and never counts.',
    order: 3,
  },
  communication: {
    id: 'communication',
    label: 'Communication',
    blurb: 'Email + messaging — reach patients where they already are, and bring their replies into one inbox.',
    order: 4,
  },
  payments: {
    id: 'payments',
    label: 'Payments',
    blurb: 'Take payments for your shop, memberships, and balances — payouts land in your own bank.',
    order: 5,
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    blurb: 'Recall, nurture, and reputation tools that bring patients back.',
    order: 6,
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics',
    blurb: 'Measurement that respects the CRM-vs-PMS line — no fabricated numbers.',
    order: 7,
  },
  scheduling: {
    id: 'scheduling',
    label: 'Scheduling',
    blurb: 'Calendars and booking surfaces beyond your PMS.',
    order: 8,
  },
  forms: {
    id: 'forms',
    label: 'Forms',
    blurb: 'Intake and document collection that lands in the patient record.',
    order: 9,
  },
  other: {
    id: 'other',
    label: 'More',
    blurb: 'Everything else that plugs into DreamCRM.',
    order: 10,
  },
}

/** Categories in display order (drives both sections + the category filter). */
export const CATEGORY_ORDER: IntegrationCategory[] = (Object.values(CATEGORY_META) as CategoryMeta[])
  .sort((a, b) => a.order - b.order)
  .map((c) => c.id)

// ── Availability + connect kind ──────────────────────────────────────────────

/**
 * Where an integration is in its lifecycle:
 *   - `live`           — wired now, connectable today.
 *   - `beta`           — wired, but early; connectable.
 *   - `request_access` — an official API exists but needs vendor/partner approval.
 *   - `coming_soon`    — genuinely planned, not yet connectable (labels itself).
 */
export type IntegrationAvailability = 'live' | 'beta' | 'request_access' | 'coming_soon'

/**
 * HOW an integration connects — the resolver maps this (plus live state) to the
 * card's connect affordance:
 *   - `zernio`        — Zernio hosted OAuth (GBP + the social shortlist).
 *   - `pms`           — the PMS connect flow (Customer Key etc.), on a detail page.
 *   - `oauth`         — a first-party OAuth flow elsewhere in the app (Gmail,
 *                       Stripe Connect) — we link to that flow, never rebuild it.
 *   - `external_link` — connect/learn happens on an external or in-app link.
 *   - `none`          — not connectable yet (coming-soon / request-access tiles).
 */
export type IntegrationConnectKind = 'zernio' | 'pms' | 'oauth' | 'external_link' | 'none'

/** Where an integration's value shows up in DreamCRM — a connected-card link. */
export interface IntegrationValueLink {
  href: string
  label: string
}

/**
 * One integration in the catalog — PURE STATIC METADATA. Live connection state
 * (connected / at-cap / premium-locked) is NEVER stored here; it's computed at
 * request time by the resolver from the loaded org state. This separation is
 * what lets the catalog scale to thousands of entries.
 */
export interface IntegrationDef {
  /** Stable id / slug (unique). Used for keys, the resolver map, deep links. */
  id: string
  /** Human name shown on the card + detail page. */
  name: string
  /** Which section/filter this lives under. */
  category: IntegrationCategory
  /** Brand-logo id resolved by `components/integrations/brand-logos.tsx`. */
  logo: BrandLogoId
  /** One-liner under the name on the card. */
  tagline: string
  /** Longer description for a detail page / search context. */
  description: string
  /** Free-text terms that power search (in addition to name + category label). */
  keywords: string[]
  /** Lifecycle state (drives the default pill + whether it's connectable). */
  availability: IntegrationAvailability
  /** How it connects (the resolver turns this into the card's connect affordance). */
  connectKind: IntegrationConnectKind
  /** A dedicated detail route, when one exists (the card links here). */
  detailHref?: string
  /** Where this integration's data surfaces (connected-card quick links). */
  valueLinks?: IntegrationValueLink[]
  /** Minimum plan to connect (e.g. Open Dental = 'premium'). Omit = any plan. */
  minPlan?: 'basic' | 'pro' | 'premium'
  /** True when this counts toward the per-plan SOCIAL connection cap. */
  countsTowardSocialCap?: boolean
  /** An honest "what's next / what it costs" note for the card footer. */
  note?: string
}

// ── THE CATALOG ──────────────────────────────────────────────────────────────
//
// Every REAL integration + every genuine roadmap item, expressed as a def. This
// is the whole inventory the marketplace renders from. Ordered loosely by
// category then prominence, but the UI sorts/groups by category itself.

export const INTEGRATIONS_CATALOG: IntegrationDef[] = [
  // ── Practice management ────────────────────────────────────────────────────
  {
    id: 'open_dental',
    name: 'Open Dental',
    category: 'pms',
    logo: 'open_dental',
    tagline: 'Two-way PMS sync in minutes with a Customer Key. Audit-clean.',
    description:
      "The most open PMS API in dentistry. Patients, appointments, providers, and balances sync both directions through Open Dental's official API, so every change lands in your Audit Trail — the opposite of the direct-database scrapers Open Dental warns against.",
    keywords: ['pms', 'practice management', 'open dental', 'sync', 'patients', 'appointments', 'sandbox', 'two-way'],
    availability: 'live',
    connectKind: 'pms',
    detailHref: '/integrations/open-dental',
    minPlan: 'premium',
    valueLinks: [
      { href: '/patients', label: 'Patients' },
      { href: '/appointments', label: 'Appointments' },
    ],
  },
  {
    id: 'dentrix_ascend',
    name: 'Dentrix Ascend',
    category: 'pms',
    logo: 'dentrix_ascend',
    tagline: 'Cloud Dentrix via the Henry Schein One API Exchange.',
    description:
      'Cloud Dentrix, through the Henry Schein One API Exchange. Requires Henry Schein One partner approval — request access and we’ll enable it for your practice.',
    keywords: ['pms', 'practice management', 'dentrix', 'ascend', 'henry schein', 'cloud'],
    availability: 'request_access',
    connectKind: 'none',
    minPlan: 'premium',
    note: 'Through the Henry Schein One API Exchange (official API only). Needs partner approval — the more practices waiting, the sooner we pursue it.',
  },
  {
    id: 'dentrix_desktop',
    name: 'Dentrix (desktop)',
    category: 'pms',
    logo: 'dentrix_desktop',
    tagline: 'On-prem Dentrix G-series via the Developer Program.',
    description:
      'On-premise Dentrix G-series through the Dentrix Developer Program. Needs a signed local connector installed at each location. On the roadmap after Open Dental.',
    keywords: ['pms', 'practice management', 'dentrix', 'desktop', 'g-series', 'on-prem'],
    availability: 'coming_soon',
    connectKind: 'none',
    minPlan: 'premium',
    note: 'On-prem G-series via the Dentrix Developer Program (signed connector per location). On the roadmap — raise your hand to help us prioritize it.',
  },
  {
    id: 'eaglesoft',
    name: 'Eaglesoft',
    category: 'pms',
    logo: 'eaglesoft',
    tagline: 'Patterson’s PMS via Patterson Innovation Connection.',
    description:
      'Patterson’s PMS — integrations run through Patterson Innovation Connection with a local agent. The most closed of the majors. On the roadmap.',
    keywords: ['pms', 'practice management', 'eaglesoft', 'patterson'],
    availability: 'coming_soon',
    connectKind: 'none',
    minPlan: 'premium',
    note: 'Via Patterson Innovation Connection (local agent). The most closed of the majors — demand tells us whether it’s worth the lift.',
  },
  {
    id: 'curve',
    name: 'Curve Dental',
    category: 'pms',
    logo: 'curve',
    tagline: 'Cloud-native PMS with an open-architecture partner network.',
    description:
      'Cloud-native PMS with an open-architecture partner network. On the roadmap after Open Dental and Dentrix.',
    keywords: ['pms', 'practice management', 'curve', 'cloud'],
    availability: 'coming_soon',
    connectKind: 'none',
    minPlan: 'premium',
    note: 'Cloud-native, open partner network — the most integration-friendly after Open Dental. Raise your hand and we’ll pursue it.',
  },

  // ── Google ─────────────────────────────────────────────────────────────────
  {
    id: 'googlebusiness',
    name: 'Google Business Profile',
    category: 'google',
    logo: 'googlebusiness',
    tagline: 'Reviews, hours, photos, and local search. Free on every plan.',
    description:
      "Pull your real Google reviews (with one-click replies and a legit star rating on your site), verified hours, address, phone, and photos, plus local search performance — all through Zernio's secure sign-in. Free on every plan; never counts toward your social cap.",
    keywords: ['google', 'gbp', 'business profile', 'reviews', 'maps', 'local search', 'hours'],
    availability: 'live',
    connectKind: 'zernio',
    detailHref: '/integrations/google-business',
    valueLinks: [
      { href: '/reviews/received', label: 'Reviews' },
      { href: '/website/seo', label: 'Local search' },
    ],
  },

  // ── Social (the dentist shortlist; each counts toward the social cap) ────────
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    logo: 'instagram',
    tagline: 'Publish and schedule posts from one place.',
    description: 'Connect your Instagram and publish or schedule posts from the unified composer.',
    keywords: ['social', 'instagram', 'ig', 'posts', 'reels'],
    availability: 'live',
    connectKind: 'zernio',
    countsTowardSocialCap: true,
    valueLinks: [{ href: '/social-posts', label: 'Compose a post' }],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    logo: 'facebook',
    tagline: 'Publish and schedule posts from one place.',
    description: 'Connect your Facebook Page and publish or schedule posts from the unified composer.',
    keywords: ['social', 'facebook', 'fb', 'page', 'posts'],
    availability: 'live',
    connectKind: 'zernio',
    countsTowardSocialCap: true,
    valueLinks: [{ href: '/social-posts', label: 'Compose a post' }],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    logo: 'tiktok',
    tagline: 'Publish and schedule posts from one place.',
    description: 'Connect your TikTok account and publish or schedule posts from the unified composer.',
    keywords: ['social', 'tiktok', 'video', 'posts'],
    availability: 'live',
    connectKind: 'zernio',
    countsTowardSocialCap: true,
    valueLinks: [{ href: '/social-posts', label: 'Compose a post' }],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    logo: 'youtube',
    tagline: 'Publish and schedule posts from one place.',
    description: 'Connect your YouTube channel and publish or schedule posts from the unified composer.',
    keywords: ['social', 'youtube', 'video', 'channel', 'posts'],
    availability: 'live',
    connectKind: 'zernio',
    countsTowardSocialCap: true,
    valueLinks: [{ href: '/social-posts', label: 'Compose a post' }],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    logo: 'linkedin',
    tagline: 'Publish and schedule posts from one place.',
    description: 'Connect your LinkedIn page and publish or schedule posts from the unified composer.',
    keywords: ['social', 'linkedin', 'posts', 'professional'],
    availability: 'live',
    connectKind: 'zernio',
    countsTowardSocialCap: true,
    valueLinks: [{ href: '/social-posts', label: 'Compose a post' }],
  },

  // ── Communication ───────────────────────────────────────────────────────────
  {
    id: 'gmail',
    name: 'Gmail',
    category: 'communication',
    logo: 'gmail',
    tagline: 'Connect your mailbox — patient email lands in your inbox.',
    description:
      'Connect your practice Gmail to read clinic-bound email in DreamCRM, reply in-thread, and send patient email from your own address. The replies surface in your unified inbox.',
    keywords: ['communication', 'gmail', 'google', 'email', 'inbox', 'mailbox'],
    availability: 'live',
    connectKind: 'oauth',
    valueLinks: [{ href: '/inbox', label: 'Inbox' }],
  },
  {
    id: 'sms',
    name: 'Text messaging (SMS)',
    category: 'communication',
    logo: 'sms',
    tagline: 'Reminders, recall, and review requests by text.',
    description:
      'Two-way SMS for appointment reminders, recall nudges, review requests, and patient replies — through AWS End User Messaging with A2P 10DLC registration. Genuinely on the roadmap.',
    keywords: ['communication', 'sms', 'text', 'messaging', 'reminders', 'a2p', 'twilio'],
    availability: 'coming_soon',
    connectKind: 'none',
    note: 'In the works — carrier registration (A2P 10DLC) takes a few weeks once it kicks off.',
  },

  // ── Payments ────────────────────────────────────────────────────────────────
  {
    id: 'stripe_connect',
    name: 'Stripe',
    category: 'payments',
    logo: 'stripe',
    tagline: 'Take payments for your shop & memberships — payouts to your bank.',
    description:
      'Connect your own Stripe account so storefront orders, membership subscriptions, and online balance payments are charged on your account and paid out to your bank. DreamCRM never holds your money.',
    keywords: ['payments', 'stripe', 'connect', 'shop', 'checkout', 'memberships', 'payouts'],
    availability: 'live',
    connectKind: 'oauth',
    valueLinks: [{ href: '/shop', label: 'Shop' }],
  },
]

// ── Pure lookup helpers (no live state) ──────────────────────────────────────

/** All distinct category ids that actually appear in the catalog, in order. */
export function catalogCategories(defs: readonly IntegrationDef[] = INTEGRATIONS_CATALOG): IntegrationCategory[] {
  const present = new Set(defs.map((d) => d.category))
  return CATEGORY_ORDER.filter((c) => present.has(c))
}

/** Find a def by id. */
export function integrationById(id: string): IntegrationDef | undefined {
  return INTEGRATIONS_CATALOG.find((d) => d.id === id)
}

/** The full searchable text for a def (name + category label + keywords). */
export function searchableText(def: IntegrationDef): string {
  return [def.name, def.tagline, CATEGORY_META[def.category].label, ...def.keywords].join(' ').toLowerCase()
}
