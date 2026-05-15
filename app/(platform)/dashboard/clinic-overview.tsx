import {
  getPatientCount, getNewPatientCount, getTodayAppointmentCount,
  getUpcomingAppointmentCount, getMonthlyNewPatients, getUpcomingAppointments,
  getRecentPatients,
} from '@/features/clinic-dashboard/queries'
import MonthBarChart from '@/features/platform-dashboard/month-bar-chart'
import ChartErrorBoundary from '@/components/ui/chart-error-boundary'

interface Props {
  orgId: string
  orgName: string
}

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

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDay(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function calcAge(dob: string | null): string {
  if (!dob) return '—'
  const birth = new Date(dob)
  const now = new Date()
  const age = now.getFullYear() - birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
  return String(age)
}

export default async function ClinicOverview({ orgId, orgName }: Props) {
  const [
    patientCount,
    newPatients30d,
    todayAppts,
    upcomingAppts,
    monthlyPatients,
    upcoming,
    recentPatients,
  ] = await Promise.all([
    getPatientCount(orgId),
    getNewPatientCount(orgId, 30),
    getTodayAppointmentCount(orgId),
    getUpcomingAppointmentCount(orgId, 7),
    getMonthlyNewPatients(orgId, 8),
    getUpcomingAppointments(orgId, 8),
    getRecentPatients(orgId, 5),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">{orgName}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your clinic at a glance</p>
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">

        {/* Patient growth KPI strip + chart */}
        <div className="flex flex-col col-span-full xl:col-span-8 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Patient Growth</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">New patients per month, last 8 months</p>
          </header>
          <div className="px-5 py-3">
            <div className="flex flex-wrap max-sm:*:w-1/2">
              <div className="flex items-center py-2">
                <div className="mr-5">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{patientCount}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Patients</div>
                </div>
                <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
              </div>
              <div className="flex items-center py-2">
                <div className="mr-5">
                  <div className="flex items-center">
                    <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{newPatients30d}</div>
                    <div className="text-sm font-medium text-emerald-700 px-1.5 bg-emerald-500/20 rounded-full">last 30d</div>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">New Patients</div>
                </div>
              </div>
            </div>
          </div>
          <ChartErrorBoundary><MonthBarChart data={monthlyPatients} color="#8b5cf6" format="count" /></ChartErrorBoundary>
        </div>

        {/* Appointments summary */}
        <div className="flex flex-col col-span-full xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Appointments</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Upcoming schedule</p>
          </header>
          <div className="px-5 py-6 grow flex flex-col justify-center gap-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-500/10 shrink-0">
                <svg className="w-6 h-6 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{todayAppts}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Today</div>
              </div>
            </div>
            <div className="w-full h-px bg-gray-100 dark:bg-gray-700/60" />
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 shrink-0">
                <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{upcomingAppts}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Next 7 days</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-12 gap-6">

        {/* Upcoming appointments */}
        <div className="col-span-full xl:col-span-7 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">Upcoming Appointments</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Next scheduled visits</p>
            </div>
          </header>
          {upcoming.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
              No upcoming appointments — book one from the <a href="/calendar" className="text-violet-500 hover:underline">Calendar</a>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full dark:text-gray-300">
                <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                  <tr>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Patient</th>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Date & Time</th>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Type</th>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                  {upcoming.map(a => (
                    <tr key={a.id}>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-800 dark:text-gray-100">
                          {a.patientFirstName} {a.patientLastName}
                        </div>
                      </td>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                        <div className="text-gray-800 dark:text-gray-100">{fmtDay(a.startTime)}</div>
                        <div className="text-xs text-gray-400">{fmtTime(a.startTime)}{a.endTime ? ` – ${fmtTime(a.endTime)}` : ''}</div>
                      </td>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {APPT_TYPE_LABEL[a.type] ?? a.type}
                      </td>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                        {apptStatusBadge(a.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent patients */}
        <div className="col-span-full xl:col-span-5 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Recent Patients</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Last 5 added</p>
          </header>
          {recentPatients.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
              No patients yet — <a href="/ecommerce/customers" className="text-violet-500 hover:underline">add your first patient</a>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full dark:text-gray-300">
                <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                  <tr>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Name</th>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Age</th>
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Phone</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                  {recentPatients.map(p => (
                    <tr key={p.id}>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-800 dark:text-gray-100">{p.firstName} {p.lastName}</div>
                        {p.email && <div className="text-xs text-gray-400">{p.email}</div>}
                      </td>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {calcAge(p.dateOfBirth)}
                      </td>
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {p.phone ?? '—'}
                      </td>
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
