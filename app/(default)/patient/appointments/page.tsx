export const metadata = {
  title: 'My Appointments - DreamCRM',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getMyPastAppointments } from '@/lib/services/patient-portal'

const APPT_TYPE_LABELS: Record<string, string> = {
  checkup: 'Checkup',
  cleaning: 'Cleaning',
  filling: 'Filling',
  extraction: 'Extraction',
  root_canal: 'Root Canal',
  consultation: 'Consultation',
  other: 'Visit',
}

export default async function PatientAppointments() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/')

  const appts = await getMyPastAppointments(ctx.patientId, ctx.organizationId)
  const now = Date.now()
  const upcoming = appts.filter((a) => new Date(a.startTime).getTime() >= now)
  const past = appts.filter((a) => new Date(a.startTime).getTime() < now)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          My Appointments
        </h1>
        <a
          href="/patient/book"
          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
        >
          + Book Visit
        </a>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No upcoming appointments.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <AppointmentRow key={a.id} appointment={a} typeLabels={APPT_TYPE_LABELS} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">History</h2>
        {past.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No past appointments.</p>
        ) : (
          <ul className="space-y-2">
            {past.map((a) => (
              <AppointmentRow key={a.id} appointment={a} typeLabels={APPT_TYPE_LABELS} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AppointmentRow({
  appointment,
  typeLabels,
}: {
  appointment: {
    id: string
    type: string
    startTime: Date
    status: string
    notes: string | null
  }
  typeLabels: Record<string, string>
}) {
  return (
    <li className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      <div>
        <p className="font-medium text-gray-800 dark:text-gray-100">
          {typeLabels[appointment.type] ?? 'Visit'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {new Date(appointment.startTime).toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
        {appointment.notes && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
            {appointment.notes}
          </p>
        )}
      </div>
      <span
        className={`text-xs font-medium px-2 py-1 rounded-full ${
          appointment.status === 'completed'
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            : appointment.status === 'confirmed'
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
              : appointment.status === 'cancelled' || appointment.status === 'no_show'
                ? 'bg-red-500/20 text-red-700 dark:text-red-400'
                : 'bg-violet-500/20 text-violet-700 dark:text-violet-400'
        }`}
      >
        {appointment.status.replace('_', ' ')}
      </span>
    </li>
  )
}
