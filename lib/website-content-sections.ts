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

export interface ContentSectionDef {
  id: string
  label: string
  desc: string
  /** Does this clinic have real content in the section? Drives the honest
   *  "N of M sections filled" stat — never a nag, just a count. */
  filled: (p: ContentProfilePick) => boolean
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

export const CONTENT_SECTIONS: ContentSectionDef[] = [
  {
    id: 'story',
    label: 'Your story',
    desc: 'The tagline patients see first and the paragraph about your practice.',
    filled: (p) => !!(p.tagline?.trim() && p.about?.trim()),
  },
  {
    id: 'services',
    label: 'Services',
    desc: 'What you offer — each one gets its own page on your site.',
    filled: (p) => nonEmpty(p.services as ClinicService[] | null),
  },
  {
    id: 'staff',
    label: 'Team',
    desc: 'The people patients will meet — photos and bios build trust.',
    filled: (p) => nonEmpty(p.staff as ClinicStaff[] | null),
  },
  {
    id: 'stats',
    label: 'Trust stats',
    desc: 'Years of care, happy patients — the quick numbers on your homepage.',
    filled: (p) => nonEmpty(p.stats as ClinicStat[] | null),
  },
  {
    id: 'photos',
    label: 'Office photos',
    desc: 'Real photos of your space — patients want to see where they’re going.',
    filled: (p) => nonEmpty(p.officePhotos as ClinicOfficePhoto[] | null),
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'The questions patients actually ask, answered in your voice.',
    filled: (p) => nonEmpty(p.faq as ClinicFaqItem[] | null),
  },
  {
    id: 'why-us',
    label: '“Why us” highlights',
    desc: 'Short chips like “Same-week visits” that set you apart.',
    filled: (p) => nonEmpty(p.differenceChips as string[] | null),
  },
  {
    id: 'coloring',
    label: 'Coloring pages',
    desc: 'Printable + digital coloring sheets for the kids’ corner of your site.',
    filled: (p) => nonEmpty(p.coloringPages as ClinicColoringPage[] | null),
    onlyTemplates: ['pediatric'],
  },
  {
    id: 'insurance',
    label: 'Insurance carriers',
    desc: 'The plans you accept — feeds your insurance page and check form.',
    filled: (p) => nonEmpty(p.acceptedInsuranceCarriers as string[] | null),
  },
  {
    id: 'methods',
    label: 'Payment methods',
    desc: 'How patients can pay.',
    filled: (p) => nonEmpty(p.paymentMethods as string[] | null),
  },
  {
    id: 'financing',
    label: 'Financing',
    desc: 'CareCredit and friends — the partners on your financing page.',
    filled: (p) => nonEmpty(p.financingPartners as ClinicFinancingPartner[] | null),
  },
  {
    id: 'cancellation',
    label: 'Cancellation policy',
    desc: 'Your reschedule/cancellation wording, shown where patients book.',
    filled: (p) => !!p.cancellationPolicy?.trim(),
  },
]

/** The sections that apply to a clinic (template-gated ones filtered). */
export function contentSectionsFor(template: string | null | undefined): ContentSectionDef[] {
  return CONTENT_SECTIONS.filter(
    (s) => !s.onlyTemplates || s.onlyTemplates.includes(template ?? 'modern'),
  )
}

/** The hub card's honest completeness stat. */
export function contentCompleteness(p: ContentProfilePick): { filled: number; total: number } {
  const sections = contentSectionsFor(p.template)
  return { filled: sections.filter((s) => s.filled(p)).length, total: sections.length }
}
