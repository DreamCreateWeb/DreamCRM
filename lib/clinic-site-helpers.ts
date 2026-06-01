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

/** "Open today · 8:00 AM – 5:00 PM" or "Closed today" — the footer's
 *  at-a-glance availability blurb. */
export function todaysHoursLabel(
  hours: Record<string, { open?: string; close?: string; closed?: boolean }>,
): string {
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
 * Structure:
 *   • "Services" parent → `${basePath}/services`, children = the clinic's CORE
 *     services (each → `/services/<routingSlug>`). No children when the clinic
 *     has no core services (parent still links to the index).
 *   • "Special Services" parent → ONLY when the clinic offers ≥1 special
 *     service; children = those special services.
 *   • About / FAQ / Blog (only when `hasBlog`) / Contact — unchanged.
 */
export function buildClinicNavLinks(opts: {
  basePath: string
  hasBlog: boolean
  services: NavService[]
}): SiteNavLink[] {
  const { basePath, hasBlog, services } = opts
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

  return [
    servicesLink,
    ...(specialLink ? [specialLink] : []),
    { label: 'About', href: `${basePath}/about` },
    { label: 'FAQ', href: `${basePath}/faq` },
    ...(hasBlog ? [{ label: 'Blog', href: `${basePath}/blog` }] : []),
    { label: 'Contact', href: `${basePath || '/'}#contact` },
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
 *  free of any server-only transitive import). */
function kebab(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
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
