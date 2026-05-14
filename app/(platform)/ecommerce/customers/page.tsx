export const metadata = {
  title: 'Patients - Dream Create',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getPatients } from '@/features/patients/queries'
import ClinicsList from '@/features/clinics-list/clinics-list'
import PatientsPanel from './patients-panel'

export default async function CustomersPage() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  if (ctx.tenantType === 'platform') {
    return <ClinicsList />
  }

  if (ctx.tenantType === 'clinic') {
    const patients = await getPatients(ctx.organizationId)
    const canEdit = ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'member'
    return <PatientsPanel patients={patients} canEdit={canEdit} />
  }

  return null
}
