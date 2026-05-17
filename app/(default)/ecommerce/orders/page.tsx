import { SelectedItemsProvider } from '@/app/selected-items-context'
import DateSelect from '@/components/date-select'
import FilterButton from '@/components/dropdown-filter'
import PaginationClassic from '@/components/pagination-classic'
import OrdersTable, { type OrderRow } from './orders-table'
import AddOrderModal from './add-order-modal'
import DeleteOrdersButton from './delete-orders-button'
import { listOrders } from '@/lib/services/orders'
import { listCustomers } from '@/lib/services/customers'
import { requireUser } from '@/lib/session'
import { formatShortDate } from '@/lib/utils'

export const metadata = {
  title: 'Orders - DreamCRM',
  description: 'Manage orders',
}

export const dynamic = 'force-dynamic'

export default async function Orders() {
  await requireUser()
  const [orders, customers] = await Promise.all([listOrders(), listCustomers()])

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
        ? items.map((i: any) => `${i.quantity ?? 1}× ${i.name}`).join(', ')
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
