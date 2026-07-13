export const metadata = {
  title: 'Platform Metrics - DreamCRM',
  description: 'Growth, revenue, churn, and project performance',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import PlatformMetrics from './platform-metrics'

export default async function AnalyticsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  if (ctx.tenantType === 'platform') {
    return <PlatformMetrics />
  }

  // Clinic analytics is a real surface now — this legacy Mosaic path used to
  // show a "coming soon" card that outlived the feature shipping.
  redirect('/growth/analytics')
}
