import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listOrders } from '@/lib/services/shop'
import OrdersClient, { type OrdersFilter } from './orders-client'

export const metadata = { title: 'Shop orders - DreamCRM' }
export const dynamic = 'force-dynamic'

// ?status= deep-links a pre-filtered view (the Overview "Fulfill orders" card
// points here with ?status=paid). Only the chips the page actually renders are
// honored; anything else falls back to "all".
function parseFilter(raw: string | string[] | undefined): OrdersFilter {
  const value = typeof raw === 'string' ? raw : ''
  return value === 'paid' || value === 'pending' ? value : 'all'
}

export default async function ShopOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const params = await searchParams
  const orders = await listOrders(ctx.organizationId)
  return (
    <OrdersClient
      orders={orders}
      orgName={ctx.organizationName}
      initialFilter={parseFilter(params.status)}
    />
  )
}
