export const metadata = {
  title: 'Clinics - DreamCRM',
  description: 'All clinic tenants and their plans, projects, and revenue',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { SelectedItemsProvider } from '@/app/selected-items-context'
import DateSelect from '@/components/date-select'
import FilterButton from '@/components/dropdown-filter'
import PaginationClassic from '@/components/pagination-classic'
import CustomersTable, { type CustomerRow } from './customers-table'
import AddCustomerModal from './add-customer-modal'
import DeleteCustomersButton from './delete-customers-button'
import { listCustomers, getCustomerOrderStats } from '@/lib/services/customers'
import PlatformClinics from './platform-clinics'

export default async function CustomersPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  // Clinic tenants now use the dental-correct Patients module at /patients.
  // The generic customers table still serves the platform org as a
  // leads/contacts list.
  if (ctx.tenantType === 'clinic') redirect('/patients')

  if (ctx.tenantType === 'platform') return <PlatformClinics />

  const [customers, stats] = await Promise.all([
    listCustomers(ctx.organizationId),
    getCustomerOrderStats(ctx.organizationId),
  ])
  const statsByCustomer = new Map(stats.map((s) => [s.customerId, s]))

  const rows: CustomerRow[] = customers.map((c) => {
    const s = statsByCustomer.get(c.id)
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      location: c.location,
      imageUrl: c.imageUrl,
      fav: c.fav,
      orderCount: s?.orderCount ?? 0,
      lastOrderNumber: s?.lastOrderNumber ?? null,
      totalSpentCents: s?.totalSpentCents ?? 0,
      refunds: 0,
    }
  })

  return (
    <SelectedItemsProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
              Patients
            </h1>
          </div>
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            <DeleteCustomersButton />
            <DateSelect />
            <FilterButton align="right" />
            <AddCustomerModal />
          </div>
        </div>

        <CustomersTable customers={rows} />

        <div className="mt-8">
          <PaginationClassic />
        </div>
      </div>
    </SelectedItemsProvider>
  )
}
