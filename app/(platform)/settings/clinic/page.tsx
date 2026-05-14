export const metadata = {
  title: 'Clinic Profile - Dream Create',
  description: 'Edit your clinic name, contact details, and branding',
}

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { getTenantContext } from '@/lib/auth/context'
import SettingsSidebar from '../settings-sidebar'
import ClinicProfilePanel from './clinic-profile-panel'

export default async function ClinicSettings() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Clinic Profile</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar />
          <ClinicProfilePanel profile={profile ?? null} orgName={ctx.organizationName} />
        </div>
      </div>
    </div>
  )
}
