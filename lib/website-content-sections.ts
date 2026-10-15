import type { ClinicProfile } from '@/lib/db/schema/platform'
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicOfficePhoto,
  ClinicFaqItem,
  ClinicColoringPage,
  ClinicFinancingPartner,
} from '@/lib/types/clinic-content'

/**
 * The Website → Content section registry — the ONE list that drives the
 * content page's section rail, the hub Content card's completeness stat
 * ("8 of 11 sections filled"), and the tests that pin both. Client-safe and
 * pure: `filled()` reads only the profile row the caller already loaded.
 *
 * Ids double as the section anchors (`#staff`) so the settings smart-search
 * deep links that used to target the clinic mega-form keep landing on the
 * matching section after the Phase-5 repoint.
 */

export type ContentGroupId = 'site' | 'money'

/** The two groups the content rail is folded into (2026-10-15 redesign). */
export const CONTENT_GROUPS: ReadonlyArray<{ id: ContentGroupId; label: string }> = [
  { id: 'site', label: 'Your site says' },
  { id: 'money', label: 'Insurance & payments' },
]

/** The plain, serialisable half of a section — what crosses the server →
 *  client boundary into the content workspace. The registry's `filled` /
 *  `summary` readers are FUNCTIONS and cannot be passed as props (React
 *  refuses at render); the page resolves them server-side and hands the
 *  client ids + words. */
export interface ContentSectionView {
  id: string
  label: string
  desc: string
  /** Which rail group it sits in. */
  group: ContentGroupId
  /** The public-site path the section is seen on — the rail's "See it on
   *  your site" door and the Studio's `?page=` deep link. */
  sitePath: string
}

export interface ContentSectionDef extends ContentSectionView {
  /** Does this clinic have real content in the section? Drives the honest
   *  "N of M sections filled" stat — never a nag, just a count. */
  filled: (p: ContentProfilePick) => boolean
  /** One short line for the rail when the section has content ("9
   *  services", "2 partners · widget on"); null when it has none — the rail
   *  says "Not set yet" in its own words. Counts only, never a judgement. */
  summary: (p: ContentProfilePick) => string | null
  /** Render only for specific templates (e.g. coloring pages). */
  onlyTemplates?: string[]
}

/** The subset of clinic_profile the registry reads — keeps tests honest and
 *  callers from loading more than they need. */
export type ContentProfilePick = Pick<
  ClinicProfile,
  | 'tagline'
  | 'about'
  | 'services'
  | 'staff'
  | 'stats'
  | 'officePhotos'
  | 'faq'
  | 'differenceChips'
  | 'coloringPages'
  | 'acceptedInsuranceCarriers'
  | 'paymentMethods'
  | 'financingPartners'
  | 'cancellationPolicy'
  | 'template'
>

const nonEmpty = (v: unknown): boolean => Array.isArray(v) && v.length > 0
const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const countOr = (v: unknown, one: string, many?: string): string | null =>
  nonEmpty(v) ? plural(count(v), one, many) : null

export const CONTENT_SECTIONS: ContentSectionDef[] = [
  {
    id: 'story',
    label: 'Your story',
    desc: 'The tagline patients see first and the paragraph about your practice.',
    group: 'site',
    sitePath: '/',
    filled: (p) => !!(p.tagline?.trim() && p.about?.trim()),
    summary: (p) => {
      const t = !!p.tagline?.trim()
      const a = !!p.about?.trim()
      if (t && a) return 'Tagline and about'
      if (t) return 'Tagline only — no about yet'
      if (a) return 'About only — no tagline yet'
      return null
    },
  },
  {
    id: 'services',
    label: 'Services',
    desc: 'What you offer — each one gets its own page on your site.',
    group: 'site',
    sitePath: '/services',
    filled: (p) => nonEmpty(p.services as ClinicService[] | null),
    summary: (p) => countOr(p.services, 'service'),
  },
  {
    id: 'staff',
    label: 'Team',
    desc: 'The people patients will meet — photos and bios build trust.',
    group: 'site',
    sitePath: '/team',
    filled: (p) => nonEmpty(p.staff as ClinicStaff[] | null),
    summary: (p) => (nonEmpty(p.staff) ? `${count(p.staff)} on the team` : null),
  },
  {
    id: 'stats',
    label: 'Trust stats',
    desc: 'Years of care, happy patients — the quick numbers on your homepage.',
    group: 'site',
    sitePath: '/',
    filled: (p) => nonEmpty(p.stats as ClinicStat[] | null),
    summary: (p) => countOr(p.stats, 'number'),
  },
  {
    id: 'photos',
    label: 'Office photos',
    desc: 'Real photos of your space — patients want to see where they’re going.',
    group: 'site',
    sitePath: '/about',
    filled: (p) => nonEmpty(p.officePhotos as ClinicOfficePhoto[] | null),
    summary: (p) => countOr(p.officePhotos, 'photo'),
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'The questions patients actually ask, answered in your voice.',
    group: 'site',
    sitePath: '/faq',
    filled: (p) => nonEmpty(p.faq as ClinicFaqItem[] | null),
    summary: (p) => countOr(p.faq, 'question'),
  },
  {
    id: 'why-us',
    label: '“Why us” highlights',
    desc: 'Short chips like “Same-week visits” that set you apart.',
    group: 'site',
    sitePath: '/',
    filled: (p) => nonEmpty(p.differenceChips as string[] | null),
    summary: (p) => countOr(p.differenceChips, 'highlight'),
  },
  {
    id: 'coloring',
    label: 'Coloring pages',
    desc: 'Printable + digital coloring sheets for the kids’ corner of your site.',
    group: 'site',
    sitePath: '/coloring',
    filled: (p) => nonEmpty(p.coloringPages as ClinicColoringPage[] | null),
    summary: (p) => countOr(p.coloringPages, 'page'),
    onlyTemplates: ['pediatric'],
  },
  {
    id: 'insurance',
    label: 'Insurance carriers',
    desc: 'The plans you accept — feeds your insurance page and check form.',
    group: 'money',
    sitePath: '/insurance',
    filled: (p) => nonEmpty(p.acceptedInsuranceCarriers as string[] | null),
    summary: (p) => countOr(p.acceptedInsuranceCarriers, 'carrier'),
  },
  {
    id: 'methods',
    label: 'Payment methods',
    desc: 'How patients can pay — cash, cards, HSA / FSA.',
    group: 'money',
    sitePath: '/payment-financing',
    filled: (p) => nonEmpty(p.paymentMethods as string[] | null),
    summary: (p) => (nonEmpty(p.paymentMethods) ? `${count(p.paymentMethods)} ways to pay` : null),
  },
  {
    id: 'financing',
    label: 'Financing',
    desc: 'Cherry, CareCredit, Sunbit and friends — apply buttons and widgets on your financing page.',
    group: 'money',
    sitePath: '/payment-financing',
    filled: (p) => nonEmpty(p.financingPartners as ClinicFinancingPartner[] | null),
    summary: (p) => {
      const list = (p.financingPartners as ClinicFinancingPartner[] | null) ?? null
      if (!nonEmpty(list)) return null
      const widget = list!.some((x) => x && typeof x === 'object' && x.showWidget === true && !!x.slug)
      return `${plural(list!.length, 'partner')}${widget ? ' · widget on' : ''}`
    },
  },
  {
    id: 'cancellation',
    label: 'Cancellation policy',
    desc: 'Your reschedule/cancellation wording, shown where patients book.',
    group: 'money',
    sitePath: '/payment-financing',
    filled: (p) => !!p.cancellationPolicy?.trim(),
    summary: (p) => (p.cancellationPolicy?.trim() ? 'Written' : null),
  },
]

/** The sections that apply to a clinic (template-gated ones filtered). */
export function contentSectionsFor(template: string | null | undefined): ContentSectionDef[] {
  return CONTENT_SECTIONS.filter(
    (s) => !s.onlyTemplates || s.onlyTemplates.includes(template ?? 'modern'),
  )
}

/** Strip a section down to what a client component may receive. */
export function toContentSectionView(s: ContentSectionDef): ContentSectionView {
  return { id: s.id, label: s.label, desc: s.desc, group: s.group, sitePath: s.sitePath }
}

/** The hub card's honest completeness stat. */
export function contentCompleteness(p: ContentProfilePick): { filled: number; total: number } {
  const sections = contentSectionsFor(p.template)
  return { filled: sections.filter((s) => s.filled(p)).length, total: sections.length }
}
