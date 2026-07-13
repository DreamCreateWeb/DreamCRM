export const metadata = {
  title: 'Revenue - DreamCRM',
  description: 'Recurring revenue, project revenue, and outstanding receivables',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import PlatformRevenue from './platform-revenue'

export default async function RevenuePage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  if (ctx.tenantType === 'platform') return <PlatformRevenue />

  // Clinic revenue is a real surface now (Shop → Payments) — this legacy
  // Mosaic path used to show a "coming soon" card.
  redirect('/shop/payments')
}
