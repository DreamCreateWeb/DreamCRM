import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listCoupons } from '@/lib/services/coupons'
import CouponsClient from './coupons-client'

export const metadata = { title: 'Coupons - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function CouponsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const coupons = await listCoupons(ctx.organizationId)
  return <CouponsClient coupons={coupons} />
}
