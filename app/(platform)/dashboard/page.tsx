export const metadata = {
  title: 'Overview - Dream Create',
  description: 'Dashboard overview',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import PlatformOverview from './platform-overview'
import ClinicOverview from './clinic-overview'
import PatientOverview from './patient-overview'

export default async function Overview() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  if (ctx.tenantType === 'patient') {
    return <PatientOverview orgId={ctx.organizationId} patientId={ctx.patientId} userName={ctx.userName} />
  }

  if (ctx.tenantType === 'clinic') {
    return <ClinicOverview orgId={ctx.organizationId} orgName={ctx.organizationName} />
  }

  return <PlatformOverview />
}
