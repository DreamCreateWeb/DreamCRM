export const metadata = {
  title: 'Calendar - Dream Create',
  description: 'Appointments and scheduling',
}

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getTenantContext } from '@/lib/auth/context'
import { getAppointments, getAppointmentStatusCounts } from '@/features/appointments/queries'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import AppointmentsPanel from './appointments-panel'
import { CalendarProvider } from './calendar-context'
import CalendarNavigation from './calendar-navigation'
import CalendarTable from './calendar-table'
import CalendarTitle from './title'

// Dummy events for the platform/admin calendar view
const DEMO_EVENTS = [
  {
    eventStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1, 10),
    eventEnd: new Date(new Date().getFullYear(), new Date().getMonth(), 1, 11),
    eventName: 'Meeting w/ Patrick Lin',
    eventColor: 'sky'
  },
  {
    eventStart: new Date(new Date().getFullYear(), new Date().getMonth(), 9, 10),
    eventEnd: new Date(new Date().getFullYear(), new Date().getMonth(), 9, 11),
    eventName: 'Meeting w/ Carolyn',
    eventColor: 'sky'
  },
  {
    eventStart: new Date(new Date().getFullYear(), new Date().getMonth(), 14, 10),
    eventEnd: new Date(new Date().getFullYear(), new Date().getMonth(), 14, 11),
    eventName: 'Team Catch-up',
    eventColor: 'green'
  },
  {
    eventStart: new Date(new Date().getFullYear(), new Date().getMonth(), 22, 10),
    eventEnd: new Date(new Date().getFullYear(), new Date().getMonth(), 22, 11),
    eventName: 'Team Catch-up',
    eventColor: 'sky'
  },
  {
    eventStart: new Date(new Date().getFullYear(), new Date().getMonth(), 25, 10),
    eventEnd: new Date(new Date().getFullYear(), new Date().getMonth(), 25, 11),
    eventName: 'Meeting w/ Kylie Joh',
    eventColor: 'sky'
  },
]

export default async function CalendarPage() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  if (ctx.tenantType === 'clinic') {
    const [appointments, patients, statusCounts] = await Promise.all([
      getAppointments(ctx.organizationId),
      db.select().from(patient).where(eq(patient.organizationId, ctx.organizationId)).orderBy(patient.firstName),
      getAppointmentStatusCounts(ctx.organizationId),
    ])
    const canEdit = ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'member'
    return (
      <AppointmentsPanel
        appointments={appointments}
        patients={patients}
        statusCounts={statusCounts}
        canEdit={canEdit}
      />
    )
  }

  // Platform / patient portal: show the template calendar with demo events
  return (
    <CalendarProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

        <div className="sm:flex sm:justify-between sm:items-center mb-4">
          <CalendarTitle />
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            <CalendarNavigation />
            <hr className="w-px h-full bg-gray-200 dark:bg-gray-700/60 border-none mx-1" />
            <button className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">Create Event</button>
          </div>
        </div>

        <div className="sm:flex sm:justify-between sm:items-center mb-4">
          <div className="mb-4 sm:mb-0 mr-2">
            <ul className="flex flex-wrap items-center -m-1">
              <li className="m-1">
                <button className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400">
                  <div className="w-1 h-3.5 bg-sky-500 shrink-0"></div>
                  <span className="ml-1.5">Dream Create</span>
                </button>
              </li>
              <li className="m-1">
                <button className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400">
                  <div className="w-1 h-3.5 bg-green-500 shrink-0"></div>
                  <span className="ml-1.5">Team</span>
                </button>
              </li>
              <li className="m-1">
                <button className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-violet-500">+Add New</button>
              </li>
            </ul>
          </div>
          <div className="flex flex-nowrap -space-x-px">
            <button className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-violet-500 rounded-none first:rounded-l-lg last:rounded-r-lg">Month</button>
            <button className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300 rounded-none first:rounded-l-lg last:rounded-r-lg">Week</button>
            <button className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300 rounded-none first:rounded-l-lg last:rounded-r-lg">Day</button>
          </div>
        </div>

        <CalendarTable events={DEMO_EVENTS} />

      </div>
    </CalendarProvider>
  )
}
