export const metadata = {
  title: 'Locations - DreamCRM',
  description: "Manage your clinic's physical practice locations",
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicLocation } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import SettingsSidebar from '../settings-sidebar'
import LocationsPanel from './locations-panel'
import { PageHeader } from '@/components/ui/page-header'

export default async function LocationsSettings() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const locations = await db
    .select()
    .from(clinicLocation)
    .where(eq(clinicLocation.organizationId, ctx.organizationId))
    .orderBy(desc(clinicLocation.isPrimary), desc(clinicLocation.createdAt))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Locations" subtitle="Physical practice locations for your clinic." />
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <LocationsPanel
            locations={locations}
            canEdit={ctx.role === 'owner' || ctx.role === 'admin'}
          />
        </div>
      </div>
    </div>
  )
}
