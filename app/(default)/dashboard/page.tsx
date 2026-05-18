export const metadata = {
  title: 'Overview - DreamCRM',
  description: 'Your overview of activity and projects',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import PlatformOverview from './platform-overview'
import ClinicOverview from './clinic-overview'

export default async function Dashboard() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') return <PlatformOverview />
  return <ClinicOverview ctx={ctx} />
}
