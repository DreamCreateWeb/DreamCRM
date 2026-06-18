export const metadata = {
  title: 'Search Appearance - DreamCRM',
  description: 'Per-page SEO title + description for your public site',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { getSeoMeta } from '@/lib/services/site-analytics'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
import SettingsSidebar from '../settings-sidebar'
import SeoMetaForm from './seo-meta-form'
import { PageHeader } from '@/components/ui/page-header'

export default async function SearchAppearanceSettingsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  // Search appearance lives with the SEO module — Pro+. requirePlan redirects
  // below-tier clinics to the upgrade screen.
  await requirePlan(ctx, 'pro', 'seo')

  const [meta, site] = await Promise.all([
    getSeoMeta(ctx.organizationId),
    getClinicSiteBySlug(ctx.organizationSlug),
  ])

  const name = site?.profile.displayName ?? ctx.organizationName
  const tagline = site?.profile.tagline ?? null
  const about = (site?.profile.about as string | null) ?? null
  // Public host shown in the preview snippet (subdomain or custom domain).
  const domain =
    (site?.profile.websiteDomain as string | null) ??
    `${ctx.organizationSlug}.${process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'}`

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Clinic settings"
        title="Search appearance"
        subtitle="Control the title + description that show in Google results for each page of your site. Leave a field blank to use the smart default we generate from your content."
      />

      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <div className="grow p-6 bg-gray-50 dark:bg-gray-900/20 rounded-r-xl">
            <div className="max-w-2xl">
              <SeoMetaForm
                initial={meta}
                clinicName={name}
                tagline={tagline}
                about={about}
                domain={domain}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
