export const metadata = {
  title: 'Overview - Dream Create',
  description: 'Dashboard overview',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import PlatformOverview from './platform-overview'
import ClinicOverview from './clinic-overview'

export default async function Overview() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  if (ctx.tenantType === 'clinic') {
    return <ClinicOverview orgId={ctx.organizationId} orgName={ctx.organizationName} />
  }

  return <PlatformOverview />
}
