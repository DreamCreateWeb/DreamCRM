export const metadata = {
  title: 'My Profile - Dream Create',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { eq } from 'drizzle-orm'
import PatientProfileForm from './patient-profile-form'

export default async function ProfilePage() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')
  if (ctx.tenantType !== 'patient') redirect('/settings/account')

  const patientRecord = ctx.patientId
    ? (await db.select().from(patient).where(eq(patient.id, ctx.patientId)).limit(1))[0] ?? null
    : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">My Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update your personal information and insurance details</p>
      </div>

      <div className="max-w-2xl bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 sm:p-8">
        {patientRecord ? (
          <PatientProfileForm patient={patientRecord} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No patient record is linked to your account. Please contact the clinic to set up your profile.
          </p>
        )}
      </div>

    </div>
  )
}
