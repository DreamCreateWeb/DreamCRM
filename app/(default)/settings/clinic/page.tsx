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
import SettingsSidebar from '../settings-sidebar'
import ClinicProfilePanel from './clinic-profile-panel'

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

  const siteUrl = profile?.websiteDomain
    ? `https://${profile.websiteDomain}`
    : `https://${ctx.organizationSlug}.${SITE_DOMAIN}`

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Clinic Profile
        </h1>
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          Preview your website
        </a>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <ClinicProfilePanel
            profile={profile ?? null}
            orgName={ctx.organizationName}
            orgId={ctx.organizationId}
            library={library}
          />
        </div>
      </div>
    </div>
  )
}
