// Client-safe careers types + pure helpers (no server-only deps), so client
// components can import labels/pipeline/formatters. DB functions live in
// lib/services/careers.ts.

/** Résumé upload constraints — shared by the public apply form (client-side
 *  guard + filename echo) and the server action (authoritative re-check).
 *  Single source of truth so the two can't drift. */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024
export const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const
/** `accept` attribute value for the file input. */
export const RESUME_ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type JobRole =
  | 'hygienist'
  | 'dental_assistant'
  | 'front_desk'
  | 'office_manager'
  | 'associate_dentist'
  | 'treatment_coordinator'
  | 'other'
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'per_diem'
export type JobStatus = 'draft' | 'open' | 'closed' | 'filled'
export type ApplicationStatus = 'new' | 'reviewing' | 'interview' | 'offer' | 'hired' | 'rejected' | 'archived'

export const ROLE_LABELS: Record<JobRole, string> = {
  hygienist: 'Dental Hygienist',
  dental_assistant: 'Dental Assistant',
  front_desk: 'Front Desk',
  office_manager: 'Office Manager',
  associate_dentist: 'Associate Dentist',
  treatment_coordinator: 'Treatment Coordinator',
  other: 'Other',
}
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  per_diem: 'Per diem',
}
// schema.org JobPosting employmentType enum.
export const EMPLOYMENT_SCHEMA: Record<EmploymentType, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  temporary: 'TEMPORARY',
  per_diem: 'PER_DIEM',
}

export const APPLICATION_PIPELINE: ApplicationStatus[] = ['new', 'reviewing', 'interview', 'offer', 'hired']

export interface JobPostingRow {
  id: string
  title: string
  slug: string
  role: JobRole
  employmentType: EmploymentType
  description: string
  responsibilities: string | null
  requirements: string | null
  benefits: string | null
  compMinCents: number | null
  compMaxCents: number | null
  compPeriod: 'hour' | 'year'
  showComp: boolean
  status: JobStatus
  applyMethod: 'in_app' | 'external'
  externalApplyUrl: string | null
  validThrough: Date | null
  postedAt: Date | null
  createdAt: Date
  applicantCount: number
  newApplicantCount: number
}

export interface ApplicationRow {
  id: string
  jobPostingId: string
  jobTitle: string
  name: string
  email: string
  phone: string | null
  resumeUrl: string | null
  linkedinUrl: string | null
  coverNote: string | null
  status: ApplicationStatus
  source: string
  rating: number | null
  notes: string | null
  createdAt: Date
  ageHours: number
}

export function formatComp(
  job: Pick<JobPostingRow, 'compMinCents' | 'compMaxCents' | 'compPeriod' | 'showComp'>,
): string | null {
  if (!job.showComp || (job.compMinCents == null && job.compMaxCents == null)) return null
  const unit = job.compPeriod === 'year' ? '/yr' : '/hr'
  const fmt = (c: number) => (job.compPeriod === 'year' ? `$${Math.round(c / 100 / 1000)}k` : `$${(c / 100).toFixed(0)}`)
  if (job.compMinCents != null && job.compMaxCents != null)
    return `${fmt(job.compMinCents)}–${fmt(job.compMaxCents)}${unit}`
  const one = job.compMinCents ?? job.compMaxCents!
  return `${fmt(one)}${unit}`
}

export interface JsonLdContext {
  orgName: string
  jobUrl: string
  datePosted: Date
  location: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
  } | null
}

/** schema.org JobPosting payload → Google for Jobs + Indeed organic. */
export function jobPostingJsonLd(job: JobPostingRow, ctx: JsonLdContext): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: [job.description, job.responsibilities, job.requirements, job.benefits].filter(Boolean).join('\n\n'),
    datePosted: ctx.datePosted.toISOString().slice(0, 10),
    employmentType: EMPLOYMENT_SCHEMA[job.employmentType],
    hiringOrganization: { '@type': 'Organization', name: ctx.orgName },
    directApply: job.applyMethod === 'in_app',
    url: ctx.jobUrl,
  }
  if (job.validThrough) ld.validThrough = job.validThrough.toISOString().slice(0, 10)
  if (ctx.location && (ctx.location.addressLocality || ctx.location.streetAddress)) {
    ld.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: ctx.location.streetAddress,
        addressLocality: ctx.location.addressLocality,
        addressRegion: ctx.location.addressRegion,
        postalCode: ctx.location.postalCode,
        addressCountry: 'US',
      },
    }
  }
  if (job.showComp && (job.compMinCents != null || job.compMaxCents != null)) {
    ld.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.compMinCents != null ? job.compMinCents / 100 : undefined,
        maxValue: job.compMaxCents != null ? job.compMaxCents / 100 : undefined,
        unitText: job.compPeriod === 'year' ? 'YEAR' : 'HOUR',
      },
    }
  }
  return ld
}
