import { SelectedItemsProvider } from '@/app/selected-items-context'
import SearchForm from '@/components/search-form'
import DateSelect from '@/components/date-select'
import FilterButton from '@/components/dropdown-filter'
import PaginationClassic from '@/components/pagination-classic'
import InvoicesTable, { type InvoiceRow } from './invoices-table'
import AddInvoiceModal from './add-invoice-modal'
import DeleteInvoicesButton from './delete-invoices-button'
import StatusFilters from './status-filters'
import SubscriptionsPanel from './subscriptions-panel'
import PlansPanel from './plans-panel'
import { invoiceCountsByStatus, listInvoices } from '@/lib/services/invoices'
import { listCustomers } from '@/lib/services/customers'
import { requireTenant } from '@/lib/auth/context'
import { listAdminProducts, listAdminSubscriptions } from '@/lib/services/stripe-admin'
import { formatShortDate } from '@/lib/utils'

export const metadata = {
  title: 'Subscriptions - DreamCRM',
  description: 'Manage subscriptions and plans',
}

export const dynamic = 'force-dynamic'

export default async function InvoicesOrSubscriptions({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const ctx = await requireTenant()
  const params = await searchParams

  // Platform admin: render Stripe management surface.
  if (ctx.tenantType === 'platform') {
    let subscriptions: Awaited<ReturnType<typeof listAdminSubscriptions>> = []
    let products: Awaited<ReturnType<typeof listAdminProducts>> = []
    let stripeError: string | null = null
    try {
      ;[subscriptions, products] = await Promise.all([listAdminSubscriptions(), listAdminProducts()])
    } catch (err) {
      stripeError = (err as Error).message
    }

    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-5">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
              Subscriptions
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage Stripe subscriptions and plans without leaving DreamCRM.
            </p>
          </div>
        </div>

        {stripeError && (
          <div className="mb-5 text-sm text-red-700 bg-red-50 dark:bg-red-500/10 px-4 py-3 rounded">
            Couldn&apos;t reach Stripe: {stripeError}
          </div>
        )}

        <div className="space-y-6">
          <SubscriptionsPanel subscriptions={subscriptions} products={products} />
          <PlansPanel products={products} />
        </div>
      </div>
    )
  }

  // Clinic / patient: keep the existing invoices list.
  const [invoices, counts, customers] = await Promise.all([
    listInvoices({ status: params.status, search: params.q }),
    invoiceCountsByStatus(),
    listCustomers(),
  ])

  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    invoice: i.invoiceNumber,
    totalCents: i.totalCents,
    currency: i.currency,
    status: i.status,
    customer: i.customerName,
    issueddate: formatShortDate(i.issueDate as unknown as string),
    paiddate: i.paidAt ? formatShortDate(i.paidAt) : '—',
    type: 'One-time',
  }))

  return (
    <SelectedItemsProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-5">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Invoices</h1>
          </div>
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            <SearchForm placeholder="Search by invoice ID…" />
            <AddInvoiceModal customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
          </div>
        </div>

        <div className="sm:flex sm:justify-between sm:items-center mb-5">
          <div className="mb-4 sm:mb-0">
            <StatusFilters counts={counts} />
          </div>
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            <DeleteInvoicesButton />
            <DateSelect />
            <FilterButton align="right" />
          </div>
        </div>

        <InvoicesTable invoices={rows} />

        <div className="mt-8">
          <PaginationClassic />
        </div>
      </div>
    </SelectedItemsProvider>
  )
}
