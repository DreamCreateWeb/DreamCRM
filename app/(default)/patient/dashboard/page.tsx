export const metadata = {
  title: 'My Portal - DreamCRM',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  getMyPatientRecord,
  getMyUpcomingAppointments,
  getMyClinicHeader,
} from '@/lib/services/patient-portal'

const APPT_TYPE_LABELS: Record<string, string> = {
  checkup: 'Checkup',
  cleaning: 'Cleaning',
  filling: 'Filling',
  extraction: 'Extraction',
  root_canal: 'Root Canal',
  consultation: 'Consultation',
  other: 'Visit',
}

export default async function PatientDashboard() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/')

  const [me, upcoming, clinic] = await Promise.all([
    getMyPatientRecord(ctx.patientId),
    getMyUpcomingAppointments(ctx.patientId, ctx.organizationId),
    getMyClinicHeader(ctx.organizationId),
  ])

  const greeting = me?.firstName ? `Hi, ${me.firstName}` : 'Welcome'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          {greeting}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your portal for {clinic?.displayName ?? ctx.organizationName}.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Upcoming Appointments
            </h2>
            <a
              href="/patient/book"
              className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Book another
            </a>
          </div>
          {upcoming.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                No upcoming appointments.
              </p>
              <a
                href="/patient/book"
                className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
              >
                Book a Visit
              </a>
            </div>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((appt) => (
                <li
                  key={appt.id}
                  className="flex items-center justify-between p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">
                      {APPT_TYPE_LABELS[appt.type] ?? 'Visit'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(appt.startTime).toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      appt.status === 'confirmed'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {appt.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Your Clinic
          </h2>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-gray-800 dark:text-gray-100">
              {clinic?.displayName ?? ctx.organizationName}
            </p>
            {clinic?.phone && (
              <a
                href={`tel:${clinic.phone}`}
                className="block text-gray-600 dark:text-gray-300 hover:underline"
              >
                📞 {clinic.phone}
              </a>
            )}
            {clinic?.email && (
              <a
                href={`mailto:${clinic.email}`}
                className="block text-gray-600 dark:text-gray-300 hover:underline"
              >
                ✉️ {clinic.email}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
