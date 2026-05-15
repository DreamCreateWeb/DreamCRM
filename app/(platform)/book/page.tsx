export const metadata = {
  title: 'Book a Visit - Dream Create',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { eq } from 'drizzle-orm'
import PatientBookForm from './patient-book-form'

export default async function BookPage() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  if (ctx.tenantType !== 'patient') {
    redirect('/calendar')
  }

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  const brand = profile?.brandColor ?? '#6d28d9'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Book a Visit</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Request your next appointment at {ctx.organizationName}</p>
      </div>

      <div className="max-w-xl">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 sm:p-8">
          <PatientBookForm
            orgId={ctx.organizationId}
            patientId={ctx.patientId}
            brand={brand}
            clinicName={ctx.organizationName}
          />
        </div>
      </div>

    </div>
  )
}
