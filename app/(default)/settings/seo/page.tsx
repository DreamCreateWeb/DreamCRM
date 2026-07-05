export const metadata = {
  title: 'Search Appearance - DreamCRM',
  description: 'Per-page SEO title + description for your public site',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { getSeoMeta } from '@/lib/services/site-analytics'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { SEO_PAGE_KEYS, type SeoPageKey } from '@/lib/types/seo-meta'
import SeoMetaForm from './seo-meta-form'
import { SettingsPage } from '../settings-kit'

export default async function SearchAppearanceSettingsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  // Search appearance lives with the SEO module — Pro+. requirePlan redirects
  // below-tier clinics to the upgrade screen.
  await requirePlan(ctx, 'pro', 'seo')

  const site = await getClinicSiteBySlug(ctx.organizationSlug)

  // Which optional public pages this clinic actually has, computed exactly like
  // the site headers do (buildClinicNavLinks gating) so the editor only offers
  // an override for a page that really exists. We only pay for the three DB
  // lookups when there's a profile to gate against; the rest read off the
  // already-loaded profile jsonb (no extra queries).
  const [publishedPosts, membershipPlans, openJobs] = site
    ? await Promise.all([
        listPublishedPosts(site.orgId, { limit: 1 }),
        listActivePlans(site.orgId),
        getOpenJobs(site.orgId),
      ])
    : [[], [], []]

  const services = (site?.profile.services as ClinicService[] | null) ?? []
  const staff = (site?.profile.staff as ClinicStaff[] | null) ?? []

  // Which pages the public site actually renders for this clinic. Pages with
  // universal defaults always render; the rest gate on their underlying data
  // exactly like buildClinicNavLinks does. `book` is Pro+-only, but this whole
  // surface is already Pro+-gated, so it always applies here. Keyed by every
  // SeoPageKey so the map is exhaustive (TS enforces it stays in lockstep with
  // SEO_PAGE_KEYS).
  const pageExists: Record<SeoPageKey, boolean> = {
    home: true,
    about: true,
    'new-patients': true,
    book: true,
    insurance: true,
    'payment-financing': true,
    faq: true,
    services: services.length > 0,
    team: staff.length > 0,
    'dental-plans': membershipPlans.length > 0,
    careers: openJobs.length > 0,
    'blog-index': publishedPosts.length > 0,
  }
  const applicablePages: SeoPageKey[] = SEO_PAGE_KEYS.filter((k) => pageExists[k])

  const meta = await getSeoMeta(ctx.organizationId)

  const name = site?.profile.displayName ?? ctx.organizationName
  const tagline = site?.profile.tagline ?? null
  const about = (site?.profile.about as string | null) ?? null
  // Public host shown in the preview snippet (subdomain or custom domain).
  const domain =
    (site?.profile.websiteDomain as string | null) ??
    `${ctx.organizationSlug}.${process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'}`

  return (
    <>
      <SettingsPage
        title="Search appearance"
        subtitle="Control the title + description that show in Google results for each page of your site. Leave a field blank to use the smart default we generate from your content."
        padded
      >
        <div className="max-w-2xl">
          <SeoMetaForm
            initial={meta}
            clinicName={name}
            tagline={tagline}
            about={about}
            domain={domain}
            applicablePages={applicablePages}
          />
        </div>
      </SettingsPage>
    </>
  )
}
