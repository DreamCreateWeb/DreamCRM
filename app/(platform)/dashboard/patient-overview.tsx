import { getPatientUpcomingAppointments } from '@/features/appointments/patient-queries'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { eq } from 'drizzle-orm'

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

interface Props {
  orgId: string
  patientId: string | null
  userName: string
}

export default async function PatientOverview({ orgId, patientId, userName }: Props) {
  const patientRecord = patientId
    ? (await db.select().from(patient).where(eq(patient.id, patientId)).limit(1))[0] ?? null
    : null

  const upcoming = patientId
    ? await getPatientUpcomingAppointments(orgId, patientId, 5)
    : []

  const firstName = patientRecord?.firstName ?? userName.split(' ')[0]
  const nextAppt = upcoming[0] ?? null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">
          Welcome back, {firstName}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your patient portal</p>
      </div>

      <div className="grid grid-cols-12 gap-6 mb-6">

        {/* Next appointment card */}
        <div className="col-span-full md:col-span-6 xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Next Appointment</h2>
          </div>
          <div className="px-5 py-6">
            {nextAppt ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-500/10 shrink-0">
                    <svg className="w-6 h-6 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 dark:text-gray-100">{nextAppt.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{APPT_TYPE_LABEL[nextAppt.type] ?? nextAppt.type}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{fmtDate(nextAppt.startTime)}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{fmtTime(nextAppt.startTime)}{nextAppt.endTime ? ` – ${fmtTime(nextAppt.endTime)}` : ''}</div>
                <div className="pt-1">{apptStatusBadge(nextAppt.status)}</div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No upcoming appointments</p>
                <a
                  href="/book"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Book a visit
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="col-span-full md:col-span-6 xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Quick Actions</h2>
          </div>
          <div className="px-5 py-4 space-y-2">
            {[
              { href: '/book', label: 'Book an Appointment', icon: 'M12 4.5v15m7.5-7.5h-15' },
              { href: '/appointments', label: 'View My Appointments', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
              { href: '/records', label: 'My Records', icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z' },
              { href: '/profile', label: 'Update My Info', icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
            ].map(({ href, label, icon }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Profile snapshot */}
        {patientRecord && (
          <div className="col-span-full xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">My Info</h2>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Email</span>
                <span className="text-gray-800 dark:text-gray-100 font-medium">{patientRecord.email ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Phone</span>
                <span className="text-gray-800 dark:text-gray-100 font-medium">{patientRecord.phone ?? '—'}</span>
              </div>
              {patientRecord.dateOfBirth && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Date of Birth</span>
                  <span className="text-gray-800 dark:text-gray-100 font-medium">{patientRecord.dateOfBirth}</span>
                </div>
              )}
              {patientRecord.insuranceProvider && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Insurance</span>
                  <span className="text-gray-800 dark:text-gray-100 font-medium">{patientRecord.insuranceProvider}</span>
                </div>
              )}
              <div className="pt-2">
                <a href="/profile" className="text-violet-600 dark:text-violet-400 hover:underline text-xs font-medium">
                  Edit my information →
                </a>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Upcoming appointments table */}
      {upcoming.length > 1 && (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Upcoming Appointments</h2>
            <a href="/appointments" className="text-sm text-violet-600 dark:text-violet-400 hover:underline">View all</a>
          </header>
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Visit</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Date & Time</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Type</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {upcoming.map(a => (
                  <tr key={a.id}>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 font-medium text-gray-800 dark:text-gray-100">{a.title}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="text-gray-800 dark:text-gray-100">{fmtDate(a.startTime)}</div>
                      <div className="text-xs text-gray-400">{fmtTime(a.startTime)}</div>
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 text-gray-500 dark:text-gray-400">{APPT_TYPE_LABEL[a.type] ?? a.type}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3">{apptStatusBadge(a.status)}</td>
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
