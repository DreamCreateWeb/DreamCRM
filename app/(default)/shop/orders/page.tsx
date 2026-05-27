import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listOrders } from '@/lib/services/shop'
import OrdersClient from './orders-client'

export const metadata = { title: 'Shop orders - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function ShopOrdersPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const orders = await listOrders(ctx.organizationId)
  return <OrdersClient orders={orders} />
}
