export const metadata = {
  title: 'Clinic Profile - DreamCRM',
  description: 'Edit your clinic name, contact details, and branding',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import { listLibraryForPicker } from '@/lib/services/service-library'
import { listClinicGmailAccounts } from '@/lib/services/clinic-sender'
import SettingsSidebar from '../settings-sidebar'
import ClinicProfilePanel from './clinic-profile-panel'
import CustomDomainCard from './custom-domain-card'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import type { CustomDomainStatus } from '@/lib/services/custom-domain'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

export default async function ClinicSettings() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  // Library available to this clinic's picker — every `active` entry plus
  // any `pending` entries this org submitted (1B own-pending visibility).
  const library = await listLibraryForPicker(ctx.organizationId)

  // Connected Google mailboxes the clinic can send patient email from (Tier 2).
  const gmailAccounts = await listClinicGmailAccounts(ctx.organizationId)

  const siteUrl = profile?.websiteDomain
    ? `https://${profile.websiteDomain}`
    : `https://${ctx.organizationSlug}.${SITE_DOMAIN}`
  // The custom-domain card always shows the subdomain as the free fallback
  // address (not the custom domain, which may not be live yet).
  const subdomainUrl = `https://${ctx.organizationSlug}.${SITE_DOMAIN}`
  const customDomainStatus = (profile?.customDomainStatus as CustomDomainStatus | null) ?? null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Settings"
        title="Clinic profile"
        subtitle="Your clinic name, contact details, branding, and website content."
        actions={
          <ActionButton href={siteUrl} variant="secondary" target="_blank">
            Preview your website ↗
          </ActionButton>
        }
      />
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <div className="grow">
            <ClinicProfilePanel
              profile={profile ?? null}
              orgName={ctx.organizationName}
              orgId={ctx.organizationId}
              library={library}
              gmailAccounts={gmailAccounts}
            />
            <div className="border-t border-gray-200 dark:border-gray-700/60">
              <CustomDomainCard
                initialStatus={customDomainStatus}
                subdomainUrl={subdomainUrl}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
