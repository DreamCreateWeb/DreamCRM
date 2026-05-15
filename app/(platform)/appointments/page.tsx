export const metadata = {
  title: 'My Appointments - Dream Create',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getPatientAppointments } from '@/features/appointments/patient-queries'
import { getAppointments } from '@/features/appointments/queries'

const APPT_TYPE_LABEL: Record<string, string> = {
  checkup: 'Checkup',
  cleaning: 'Cleaning',
  filling: 'Filling',
  extraction: 'Extraction',
  root_canal: 'Root Canal',
  consultation: 'Consultation',
  other: 'Other',
}

function apptStatusBadge(status: string) {
  const cfg: Record<string, string> = {
    scheduled: 'bg-sky-100 dark:bg-sky-400/20 text-sky-700 dark:text-sky-400',
    confirmed: 'bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400',
    completed: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    cancelled: 'bg-red-100 dark:bg-red-400/20 text-red-600 dark:text-red-400',
    no_show: 'bg-amber-100 dark:bg-amber-400/20 text-amber-700 dark:text-amber-400',
  }
  const label = status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg[status] ?? cfg.scheduled}`}>
      {label}
    </span>
  )
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function AppointmentsPage() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  if (ctx.tenantType !== 'patient') {
    redirect('/calendar')
  }

  const appointments = ctx.patientId
    ? await getPatientAppointments(ctx.organizationId, ctx.patientId)
    : []

  const upcoming = appointments.filter(a => a.startTime >= new Date() && !['cancelled', 'no_show'].includes(a.status))
  const past = appointments.filter(a => a.startTime < new Date() || ['cancelled', 'no_show', 'completed'].includes(a.status))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">My Appointments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your scheduled and past visits</p>
        </div>
        <a
          href="/book"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Book Visit
        </a>
      </div>

      {/* Upcoming */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-6">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Upcoming</h2>
        </header>
        {upcoming.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No upcoming appointments</p>
            <a href="/book" className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline">Book a visit →</a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Visit</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Date & Time</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Type</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {upcoming.map(a => (
                  <tr key={a.id}>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">{a.title}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="text-gray-800 dark:text-gray-100">{fmtDate(a.startTime)}</div>
                      <div className="text-xs text-gray-400">{fmtTime(a.startTime)}</div>
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{APPT_TYPE_LABEL[a.type] ?? a.type}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">{apptStatusBadge(a.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Past Visits</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Visit</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Date & Time</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Type</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {past.map(a => (
                  <tr key={a.id} className="opacity-70">
                    <td className="px-2 first:pl-5 last:pr-5 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">{a.title}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="text-gray-600 dark:text-gray-300">{fmtDate(a.startTime)}</div>
                      <div className="text-xs text-gray-400">{fmtTime(a.startTime)}</div>
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{APPT_TYPE_LABEL[a.type] ?? a.type}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">{apptStatusBadge(a.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
