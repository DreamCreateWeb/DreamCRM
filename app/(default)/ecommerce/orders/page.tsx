import { redirect } from 'next/navigation'
import { SelectedItemsProvider } from '@/app/selected-items-context'
import DateSelect from '@/components/date-select'
import FilterButton from '@/components/dropdown-filter'
import PaginationClassic from '@/components/pagination-classic'
import OrdersTable, { type OrderRow } from './orders-table'
import AddOrderModal from './add-order-modal'
import DeleteOrdersButton from './delete-orders-button'
import SalesPipeline from './sales-pipeline'
import { listOrders } from '@/lib/services/orders'
import { listCustomers } from '@/lib/services/customers'
import { requireTenant } from '@/lib/auth/context'
import { formatShortDate } from '@/lib/utils'

export const metadata = {
  title: 'Sales Pipeline - DreamCRM',
  description: 'Track every agency project across all clinics',
}

export const dynamic = 'force-dynamic'

export default async function OrdersOrPipeline() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  if (ctx.tenantType === 'platform') return <SalesPipeline />

  // Clinic tenants belong in the dental-correct Shop orders surface — this
  // generic Mosaic orders/pipeline view isn't part of their nav. Platform
  // keeps the sales pipeline above. (Mirrors the /calendar → /appointments
  // and /ecommerce/customers → /patients clinic redirects.)
  if (ctx.tenantType === 'clinic') redirect('/shop/orders')

  // Unreachable now (platform returned the pipeline above; patient + clinic
  // redirect away) — the original Mosaic orders view is kept below intact so
  // the route still works if the tenant branching ever changes.
  const [orders, customers] = await Promise.all([
    listOrders(ctx.organizationId),
    listCustomers(ctx.organizationId),
  ])
  const rows: OrderRow[] = orders.map((o) => {
    const items = Array.isArray(o.items) ? o.items : []
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      date: formatShortDate(o.createdAt),
      customer: o.customerName,
      totalCents: o.totalCents,
      currency: o.currency,
      status: o.status,
      itemCount: items.length || 1,
      location: o.location,
      type: items.length > 1 ? 'Multi-item' : 'One-time',
      description: items.length
        ? items.map((i: { quantity?: number; name: string }) => `${i.quantity ?? 1}× ${i.name}`).join(', ')
        : 'No item details recorded.',
    }
  })

  return (
    <SelectedItemsProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Orders</h1>
          </div>
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            <DeleteOrdersButton />
            <DateSelect />
            <FilterButton align="right" />
            <AddOrderModal customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
          </div>
        </div>
        <OrdersTable orders={rows} />
        <div className="mt-8">
          <PaginationClassic />
        </div>
      </div>
    </SelectedItemsProvider>
  )
}
