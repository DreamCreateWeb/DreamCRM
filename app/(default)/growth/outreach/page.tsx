import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ClinicRecallDashboard from '../../marketing/clinic-recall-dashboard'

export const metadata = {
  title: 'Recall & Outreach - DreamCRM',
  description: 'Who needs a nudge today — recall due, lapsed, birthdays, and your campaign performance.',
}

export const dynamic = 'force-dynamic'

/**
 * Growth → Outreach — the clinic recall dashboard's home in the Growth
 * workspace (moved from /marketing, which now serves only the platform
 * tenant's pipeline). The dashboard component itself stays in
 * app/(default)/marketing/ — it shares its actions + data layer with the
 * platform surfaces, so only the ROUTE moved.
 */
export default async function GrowthOutreachPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/marketing')
  return <ClinicRecallDashboard ctx={ctx} />
}
