// Shared helpers for the clinic public-site surfaces (homepage, /about,
// /services, /faq). Pure formatting / string utilities — no DB calls, safe to
// import from both server components and client-renderable demos.

import type { ClinicService } from '@/lib/types/clinic-content'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const DAY_LABEL: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

export interface HourEntry { open?: string; close?: string; closed?: boolean }
export type HoursMap = Record<string, HourEntry>

export function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** First sentence of a longer about paragraph — used as the hero subhead so
 *  the H1 stays a clean value-prop statement and the warm context lives one
 *  beat below it. Falls back to the whole string when no terminator is
 *  found. */
export function firstSentence(text: string): string {
  const m = text.trim().match(/^[\s\S]+?[.!?](?=\s|$)/)
  return m ? m[0] : text.trim()
}

/** The complement of `firstSentence`: everything AFTER the first sentence,
 *  trimmed. Empty string when the text is a single sentence (or has no
 *  terminator). Used to avoid duplicating the hero subhead — which already
 *  shows `firstSentence(about)` — in the body copy below it. */
export function afterFirstSentence(text: string): string {
  const first = firstSentence(text)
  const rest = text.trim().slice(first.length).trim()
  return rest
}

/**
 * Resolve a per-clinic copy override (Website Studio) by stable key, falling
 * back to the template's built-in default. `overrides` is the
 * `clinic_profile.copyOverrides` map; an unset/blank key yields the fallback.
 */
export function copyOverride(
  overrides: Record<string, string> | null | undefined,
  key: string,
  fallback: string,
): string {
  const v = overrides?.[key]
  return typeof v === 'string' && v.trim() ? v : fallback
}

/**
 * Whether the clinic offers public online self-scheduling — the live slot
 * picker on /book where patients pick their own time. When false, the website's
 * "Book a Visit" button leads to a request-only contact form whose submission
 * lands as a message in the inbox (the clinic schedules manually).
 *
 * null/undefined → treated as ENABLED, matching the not-null `default(true)`
 * column, so a partially-loaded or legacy profile never accidentally hides
 * booking. Only an explicit `false` disables it.
 */
export function isSelfBookingEnabled(
  profile: { selfBookingEnabled?: boolean | null } | null | undefined,
): boolean {
  return profile?.selfBookingEnabled !== false
}

/**
 * Resolve a list of `{ title, body }` cards through copy-overrides keyed by
 * `{prefix}.{i}.title` / `{prefix}.{i}.body`. Pairs with `NumberedSteps`'
 * `editKeyPrefix` (and any in-page card grid using the same keys) so each
 * card's text is inline-editable in the Website Studio. Unedited items keep
 * their built-in copy.
 */
export function resolveCopyList<T extends { title: string; body: string }>(
  overrides: Record<string, string> | null | undefined,
  prefix: string,
  items: T[],
): T[] {
  return items.map((it, i) => ({
    ...it,
    title: copyOverride(overrides, `${prefix}.${i}.title`, it.title),
    body: copyOverride(overrides, `${prefix}.${i}.body`, it.body),
  }))
}

/** "Open today · 8:00 AM – 5:00 PM" or "Closed today" — the footer's
 *  at-a-glance availability blurb. */
export function todaysHoursLabel(
  hours: Record<string, { open?: string; close?: string; closed?: boolean }> | null | undefined,
): string {
  // Defensive: a fresh clinic can have null hours and some callers don't guard.
  if (!hours || typeof hours !== 'object') return 'Closed today'
  const KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const todayKey = KEY[new Date().getDay()]
  const entry = hours[todayKey]
  if (!entry || entry.closed) return 'Closed today'
  if (!entry.open || !entry.close) return 'Hours by appointment'
  return `Open today · ${fmt12(entry.open)} – ${fmt12(entry.close)}`
}

// ── Site navigation ──────────────────────────────────────────────────────────

/** A nav entry for the clinic public-site header/footer. A link with
 *  `children` renders as a dropdown on desktop and an indented sub-list on
 *  mobile. Client-safe — no server imports — so every `<SiteHeader>` call site
 *  can build the same structure via `buildClinicNavLinks`. */
export interface SiteNavLink {
  label: string
  href: string
  children?: Array<{ label: string; href: string }>
}

/** Minimal service shape the nav builder needs — name (label), routing slug,
 *  and category (drives the Core vs Special dropdown). Both the resolved
 *  `EnrichedService` and a hand-built `{ name, routingSlug, category }` satisfy
 *  this, so the helper stays free of any server-only import. */
export interface NavService {
  name: string
  routingSlug: string
  category: 'core' | 'special'
}

/**
 * Build the canonical clinic-site nav structure used site-wide (homepage,
 * /about, /services, /faq, /book, /careers, and every service detail page).
 * Centralizing it here keeps the nav identical across every `<SiteHeader>`
 * call site — change it once, it changes everywhere.
 *
 * Structure (Checkpoint 3 — About consolidates Team/Blog/Careers/FAQ):
 *   • "Services" parent → `${basePath}/services`, children = the clinic's CORE
 *     services (each → `/services/<routingSlug>`). No children when the clinic
 *     has no core services (parent still links to the index).
 *   • "Special Services" parent → ONLY when the clinic offers ≥1 special
 *     service; children = those special services.
 *   • "Patients" parent → /insurance · /payment-financing · /dental-plans (the
 *     last only when `hasDentalPlans=true`; we don't surface a dental-plans
 *     link when the clinic has no active membership plans).
 *   • "About" parent → /about, children:
 *       - About <clinic> → /about (the parent itself, also surfaced as a child
 *         so the dropdown is self-explanatory on mobile sub-nav)
 *       - Meet Our Team → /team (only when `hasTeam=true`)
 *       - Blog → /blog (only when `hasBlog=true`)
 *       - Careers → /careers (only when `hasCareers=true`)
 *       - FAQ → /faq (always — universal defaults render even when the clinic
 *         hasn't authored any FAQ items)
 *   • Contact — unchanged.
 *
 * `hasTeam` / `hasBlog` / `hasCareers` / `hasDentalPlans` mirror each other:
 * each calling page determines whether the clinic has the underlying content
 * and passes the boolean in. Keeps the helper pure (sync) so it doesn't
 * cascade into every call site as async. Defaults to `false` so existing /
 * lighter call sites that don't load these (e.g. inside test mocks) don't
 * accidentally surface broken links.
 *
 * FAQ and Blog are NO LONGER top-level — they live inside the About dropdown.
 */
export function buildClinicNavLinks(opts: {
  basePath: string
  hasBlog: boolean
  services: NavService[]
  hasDentalPlans?: boolean
  hasTeam?: boolean
  hasCareers?: boolean
}): SiteNavLink[] {
  const {
    basePath,
    hasBlog,
    services,
    hasDentalPlans = false,
    hasTeam = false,
    hasCareers = false,
  } = opts
  const core = services.filter((s) => s.category !== 'special')
  const special = services.filter((s) => s.category === 'special')

  const servicesLink: SiteNavLink = {
    label: 'Services',
    href: `${basePath}/services`,
    ...(core.length > 0
      ? {
          children: core.map((s) => ({
            label: s.name,
            href: `${basePath}/services/${s.routingSlug}`,
          })),
        }
      : {}),
  }

  const specialLink: SiteNavLink | null =
    special.length > 0
      ? {
          label: 'Special Services',
          href: `${basePath}/services`,
          children: special.map((s) => ({
            label: s.name,
            href: `${basePath}/services/${s.routingSlug}`,
          })),
        }
      : null

  // Patients dropdown — always renders Insurance + Payment & Financing.
  // Dental Plans appears only when the clinic has ≥1 active membership plan
  // (gated by `hasDentalPlans`), so we don't surface a link that lands on a
  // notFound() page when the clinic hasn't enabled membership.
  const patientsLink: SiteNavLink = {
    label: 'Patients',
    href: `${basePath}/insurance`,
    children: [
      { label: 'Insurance', href: `${basePath}/insurance` },
      { label: 'Payment & Financing', href: `${basePath}/payment-financing` },
      ...(hasDentalPlans
        ? [{ label: 'Dental Plans', href: `${basePath}/dental-plans` }]
        : []),
    ],
  }

  // About dropdown — consolidates About + Team + Blog + Careers + FAQ.
  // Order is Tend's pattern: storytelling (About) → people (Team) → content
  // (Blog) → joining the team (Careers) → reference (FAQ). FAQ always renders
  // (universal defaults); the other gated children only show when the clinic
  // has the underlying content so empty links never appear.
  const aboutChildren: Array<{ label: string; href: string }> = [
    { label: 'About', href: `${basePath}/about` },
    ...(hasTeam ? [{ label: 'Meet Our Team', href: `${basePath}/team` }] : []),
    ...(hasBlog ? [{ label: 'Blog', href: `${basePath}/blog` }] : []),
    ...(hasCareers ? [{ label: 'Careers', href: `${basePath}/careers` }] : []),
    { label: 'FAQ', href: `${basePath}/faq` },
  ]
  const aboutLink: SiteNavLink = {
    label: 'About',
    href: `${basePath}/about`,
    children: aboutChildren,
  }

  return [
    servicesLink,
    ...(specialLink ? [specialLink] : []),
    patientsLink,
    aboutLink,
    // Footer carries phone / email / Book / address on every page + tier, so it
    // is the one contact destination that always resolves. (The old `#contact`
    // anchor only existed on the basic-tier homepage contact form.)
    { label: 'Contact', href: '#site-footer-contact' },
  ]
}

// Slug map of the canonical seed → category, for client-safe category lookup
// without a DB call (the server resolver `resolveClinicServices` is the
// authoritative path; this mirrors it for sync server components like the
// homepage template that already hold the raw `ClinicService[]`).
const SEED_CATEGORY_BY_SLUG = new Map(
  SERVICE_LIBRARY_SEED.map((e) => [e.slug, e.category]),
)

/** Local kebab-case (mirror of lib/utils slugify, inlined to keep this file
 *  free of any server-only transitive import). Exported so the /team detail
 *  page can derive a stable slug from a staff member's name when no explicit
 *  `slug` is set. */
export function kebab(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

/**
 * Resolve the URL slug for a staff member — explicit `slug` override when
 * present + valid, else kebab(name). Returns null only when neither is
 * resolvable (degenerate staff with no name). Used by both the /team index
 * (to build per-card links) + the /team/[staffSlug] resolver (to match an
 * incoming param against the staff array).
 */
export function staffSlug(staff: { slug?: string | null; name: string }): string | null {
  const explicit = staff.slug?.trim()
  if (explicit && /^[a-z0-9-]+$/i.test(explicit)) return explicit.toLowerCase()
  const derived = kebab(staff.name)
  return derived.length > 0 ? derived : null
}

/**
 * Derive nav-ready `NavService[]` from a clinic's raw `ClinicService[]` —
 * pure, no DB. Routing slug = `librarySlug` (when linked) else kebab(name);
 * category = the clinic-set `category`, else the seed's category for the linked
 * slug, else 'core'. Used by the homepage template (a sync server component)
 * so its header dropdowns match the server-resolved /services grouping without
 * an extra DB roundtrip.
 */
export function navServicesFromClinicServices(
  services: ClinicService[],
): NavService[] {
  return services
    .filter((s) => s.name && s.name.trim().length > 0)
    .map((s) => {
      const routingSlug = s.librarySlug || kebab(s.name) || s.id
      const category: 'core' | 'special' =
        s.category === 'special'
          ? 'special'
          : s.category === 'core'
            ? 'core'
            : (s.librarySlug && SEED_CATEGORY_BY_SLUG.get(s.librarySlug)) || 'core'
      return { name: s.name, routingSlug, category }
    })
}

const HONORIFICS = new Set(['dr.', 'dr', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms'])
const POST_NOMINALS = /(,\s*)?(rdh|dds|dmd|md|np|rn|phd)\.?$/i

/** Initials chip for staff who haven't uploaded a photo yet. Strips common
 *  honorifics ("Dr. Jane Lee" → "JL", not "DJ") + post-nominals
 *  ("Maria Vega, RDH" → "MV", not "MR"). */
export function staffInitials(fullName: string): string {
  const cleaned = fullName.trim().replace(POST_NOMINALS, '').trim()
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w.toLowerCase()))
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}
