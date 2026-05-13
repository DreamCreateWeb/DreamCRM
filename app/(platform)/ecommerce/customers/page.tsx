import { getTenantContext } from '@/lib/auth/context'
import ClinicsList from '@/features/clinics-list/clinics-list'

export const metadata = {
  title: 'Customers - Dream Create',
}

/**
 * Tenant-aware customers page.
 *
 *   Platform tenants → list of clinics (their customers)
 *   Clinic tenants   → list of patients (their customers) — coming soon
 *   Patient tenants  → shouldn't see this; layout redirects
 */
export default async function CustomersPage() {
  const ctx = await getTenantContext()
  if (!ctx) return null

  if (ctx.tenantType === 'platform') {
    return <ClinicsList />
  }

  if (ctx.tenantType === 'clinic') {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Patients</h1>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">
            The patients module is coming soon. We&apos;re wiring up the schema for patient records,
            insurance, and medical history.
          </p>
        </div>
      </div>
    )
  }

  return null
}
