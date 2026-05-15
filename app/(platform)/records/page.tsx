export const metadata = {
  title: 'My Records - Dream Create',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { eq } from 'drizzle-orm'
import { getPatientAppointments } from '@/features/appointments/patient-queries'

function labelValue(label: string, value: string | null | undefined) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4 py-3 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 sm:w-40 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-100">{value || '—'}</span>
    </div>
  )
}

export default async function RecordsPage() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')
  if (ctx.tenantType !== 'patient') redirect('/dashboard')

  const patientRecord = ctx.patientId
    ? (await db.select().from(patient).where(eq(patient.id, ctx.patientId)).limit(1))[0] ?? null
    : null

  const appointments = ctx.patientId
    ? await getPatientAppointments(ctx.organizationId, ctx.patientId)
    : []

  const completedVisits = appointments.filter(a => a.status === 'completed')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">My Records</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your profile and visit history</p>
      </div>

      <div className="grid grid-cols-12 gap-6">

        {/* Personal info */}
        <div className="col-span-full lg:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Personal Information</h2>
            <a href="/profile" className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">Edit</a>
          </header>
          <div className="px-5 py-2">
            {patientRecord ? (
              <>
                {labelValue('Full Name', `${patientRecord.firstName} ${patientRecord.lastName}`)}
                {labelValue('Date of Birth', patientRecord.dateOfBirth)}
                {labelValue('Email', patientRecord.email)}
                {labelValue('Phone', patientRecord.phone)}
                {labelValue('Address', [patientRecord.addressLine1, patientRecord.city, patientRecord.state, patientRecord.postalCode].filter(Boolean).join(', '))}
              </>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">No record on file. <a href="/profile" className="text-violet-500 hover:underline">Update your profile</a>.</p>
            )}
          </div>
        </div>

        {/* Insurance */}
        <div className="col-span-full lg:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Insurance</h2>
          </header>
          <div className="px-5 py-2">
            {patientRecord ? (
              <>
                {labelValue('Provider', patientRecord.insuranceProvider)}
                {labelValue('Policy Number', patientRecord.insurancePolicyNumber)}
                {labelValue('Group Number', patientRecord.insuranceGroupNumber)}
              </>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">No insurance on file.</p>
            )}
          </div>
        </div>

        {/* Visit history */}
        <div className="col-span-full bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Visit History</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Completed visits ({completedVisits.length})</p>
          </header>
          {completedVisits.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
              No completed visits on record yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full dark:text-gray-300">
                <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                  <tr>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Visit</th>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Date</th>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                  {completedVisits.map(a => (
                    <tr key={a.id}>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">{a.title}</td>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {a.startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 text-gray-500 dark:text-gray-400">{a.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
