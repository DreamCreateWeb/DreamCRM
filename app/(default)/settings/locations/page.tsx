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
    <>
      <PageHeader eyebrow="Clinic settings" title="Locations" subtitle="Physical practice locations for your clinic." />
      <div className="v2-panel mb-8">
        <LocationsPanel
          locations={locations}
          canEdit={ctx.role === 'owner' || ctx.role === 'admin'}
        />
      </div>
    </>
  )
}
