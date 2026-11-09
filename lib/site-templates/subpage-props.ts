/**
 * The typed props for every SUBPAGE body renderer (ML-52). Each interface is
 * exactly what its page shell (app/site/[slug]/<page>) already computes —
 * the shell owns every read / SEO / gate; a template body is pure
 * presentation. Types only, client-safe.
 */
import type { ComponentType } from 'react'
import type { BlogPost } from '@/lib/db/schema/clinic'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { EnrichedService } from '@/lib/services/service-library'
import type { ClinicTestimonial, ClinicFaqItem, ClinicService, ClinicStat, ClinicStaff, ClinicOfficePhoto } from '@/lib/types/clinic-content'
import type { ResolvedFinancingPartner, WidgetFonts } from '@/lib/financing-providers'
import type { PlanRow } from '@/lib/types/membership'
import type { SiteOffice } from '@/lib/site-offices'
import type { JobPostingRow } from '@/lib/types/careers'

export interface ServicesPageBodyProps {
  copy: (key: string, fallback: string) => string
  headingInk: string
  name: string
  bookHref: string
  brand: string
  bookLabel: string
  profile: ClinicSiteData['profile']
  resolved: EnrichedService[]
  core: EnrichedService[]
  basePath: string
  special: EnrichedService[]
}

export interface ServicePagePageBodyProps {
  service: EnrichedService
  brand: string
  categoryLabel: "Special service" | "Core service"
  headingInk: string
  name: string
  bookHref: string
  bookLabel: string
  profile: ClinicSiteData['profile']
  heroImage: string | null
  testimonials: ClinicTestimonial[]
  related: EnrichedService[]
  basePath: string
}

export interface NewPatientsPageBodyProps {
  copyOverrides: Record<string, string> | null
  headingInk: string
  name: string
  bookHref: string
  brand: string
  bookLabel: string
  intakeOpen: boolean
  intakeHref: string
  expectSteps: { title: string; body: string; }[]
  bringItems: { title: string; body: string; }[]
  hasDentalPlans: boolean
  insuranceBodyDerived: string
  basePath: string
  paymentBodyDerived: string
  npFaq: ClinicFaqItem[]
  profile: ClinicSiteData['profile']
}

export interface InsurancePageBodyProps {
  copyOverrides: Record<string, string> | null
  headingInk: string
  name: string
  bookHref: string
  brand: string
  bookLabel: string
  helpBullets: { title: string; body: string; }[]
  insuranceCarriers: string[]
  data: ClinicSiteData
  services: ClinicService[]
  profile: ClinicSiteData['profile']
  inNetworkSteps: { title: string; body: string; }[]
  outOfNetworkSteps: { title: string; body: string; }[]
  hasDentalPlans: boolean
  basePath: string
  insuranceFaq: ClinicFaqItem[]
}

export interface FinancingPageBodyProps {
  copyOverrides: Record<string, string> | null
  headingInk: string
  name: string
  bookHref: string
  brand: string
  bookLabel: string
  profile: ClinicSiteData['profile']
  howSteps: { title: string; body: string; }[]
  paymentMethods: string[]
  financingPartners: ResolvedFinancingPartner[]
  primaryWidget: ResolvedFinancingPartner | null
  widgetBrand: string
  widgetFonts: WidgetFonts
  cancellationPolicy: string | null
  billingFaq: ClinicFaqItem[]
}

export interface PlansPageBodyProps {
  copyOverrides: Record<string, string> | null
  headingInk: string
  name: string
  slug: string
  brand: string
  plans: PlanRow[]
  invitedPlan: PlanRow | null
  invitedEmail: string
  bookLabel: string
  bookHref: string
  profile: ClinicSiteData['profile']
}

export interface AboutPageBodyProps {
  copyOverrides: Record<string, string> | null
  name: string
  headingInk: string
  profile: ClinicSiteData['profile']
  bookHref: string
  brand: string
  bookLabel: string
  aboutRest: string
  stats: ClinicStat[]
  staff: ClinicStaff[]
  officePhotos: ClinicOfficePhoto[]
  testimonials: ClinicTestimonial[]
  mapOffice: SiteOffice
  data: ClinicSiteData
}

export interface TeamPageBodyProps {
  copyOverrides: Record<string, string> | null
  headingInk: string
  name: string
  heroLead: string
  hasTeam: boolean
  staff: ClinicStaff[]
  basePath: string
  brand: string
  bookHref: string
  bookLabel: string
  profile: ClinicSiteData['profile']
}

export interface CareersPageBodyProps {
  headingInk: string
  copyOverrides: Record<string, string> | null
  name: string
  brand: string
  jobs: JobPostingRow[]
  basePath: string
  cityState: string
  data: ClinicSiteData
}

export interface FaqPageBodyProps {
  copyOverrides: Record<string, string> | null
  headingInk: string
  orderedCategories: string[]
  grouped: Map<string, ClinicFaqItem[]>
  bookLabel: string
  bookHref: string
  profile: ClinicSiteData['profile']
  brand: string
}

export interface BlogIndexPageBodyProps {
  blogLd: Record<string, unknown> | null
  brand: string
  headingInk: string
  name: string
  categories: string[]
  basePath: string
  category: string | undefined
  posts: { id: string; slug: string; createdAt: Date; organizationId: string; faq: unknown; updatedAt: Date; title: string; excerpt: string | null; bodyHtml: string; bodyJson: unknown; coverImageUrl: string | null; category: string | null; tags: unknown; status: string; source: string; authorStaffId: string | null; authorName: string | null; seoTitle: string | null; seoDescription: string | null; coverImageAlt: string | null; medicallyReviewedByStaffId: string | null; medicallyReviewedAt: Date | null; viewCount: number; scheduledFor: Date | null; publishedAt: Date | null; archivedAt: Date | null; }[]
  featured: { id: string; slug: string; createdAt: Date; organizationId: string; faq: unknown; updatedAt: Date; title: string; excerpt: string | null; bodyHtml: string; bodyJson: unknown; coverImageUrl: string | null; category: string | null; tags: unknown; status: string; source: string; authorStaffId: string | null; authorName: string | null; seoTitle: string | null; seoDescription: string | null; coverImageAlt: string | null; medicallyReviewedByStaffId: string | null; medicallyReviewedAt: Date | null; viewCount: number; scheduledFor: Date | null; publishedAt: Date | null; archivedAt: Date | null; } | null
  featuredAuthor: ClinicStaff | null
  restPosts: { id: string; slug: string; createdAt: Date; organizationId: string; faq: unknown; updatedAt: Date; title: string; excerpt: string | null; bodyHtml: string; bodyJson: unknown; coverImageUrl: string | null; category: string | null; tags: unknown; status: string; source: string; authorStaffId: string | null; authorName: string | null; seoTitle: string | null; seoDescription: string | null; coverImageAlt: string | null; medicallyReviewedByStaffId: string | null; medicallyReviewedAt: Date | null; viewCount: number; scheduledFor: Date | null; publishedAt: Date | null; archivedAt: Date | null; }[]
  restAuthors: (ClinicStaff | null)[]
  bookHref: string
  data: ClinicSiteData
}

/** The blog article body — the props `BlogArticle` always took. */
export interface BlogPostPageBodyProps {
  post: BlogPost
  author: ClinicStaff | null
  reviewer: ClinicStaff | null
  related: BlogPost[]
  brand: string
  basePath: string
  selfBooking: boolean
}

export interface SubpagePropsMap {
  blogPost: BlogPostPageBodyProps
  services: ServicesPageBodyProps
  servicePage: ServicePagePageBodyProps
  newPatients: NewPatientsPageBodyProps
  insurance: InsurancePageBodyProps
  financing: FinancingPageBodyProps
  plans: PlansPageBodyProps
  about: AboutPageBodyProps
  team: TeamPageBodyProps
  careers: CareersPageBodyProps
  faq: FaqPageBodyProps
  blogIndex: BlogIndexPageBodyProps
}

export type SubpageKey = keyof SubpagePropsMap

/** Every subpage key, in one list the registry + harness iterate. */
export const SUBPAGE_KEYS: SubpageKey[] = ['blogPost', 'services', 'servicePage', 'newPatients', 'insurance', 'financing', 'plans', 'about', 'team', 'careers', 'faq', 'blogIndex']

/** The renderer map every template carries: one body per subpage key. */
export type SubpageRenderers = { [K in SubpageKey]: ComponentType<SubpagePropsMap[K]> }
