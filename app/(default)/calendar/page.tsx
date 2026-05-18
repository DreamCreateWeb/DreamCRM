import { CalendarProvider } from './calendar-context'
import CalendarNavigation from './calendar-navigation'
import CalendarTable from './calendar-table'
import CalendarTitle from './title'
import CreateEventModal from './create-event-modal'
import { requireTenant } from '@/lib/auth/context'
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CALENDAR_CATEGORIES,
  listCalendarEvents,
  type CalendarCategory,
} from '@/lib/services/calendar'

export const metadata = {
  title: 'Calendar - DreamCRM',
  description: 'Schedule events, meetings and reminders',
}

export const dynamic = 'force-dynamic'

export default async function Calendar() {
  const ctx = await requireTenant()

  // Fetch a 3-month window centered on today so prev/current/next-month views render.
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59)

  const dbEvents = await listCalendarEvents(ctx.organizationId, { from, to })
  const events = dbEvents.map((e) => ({
    eventStart: new Date(e.startsAt),
    eventEnd: e.endsAt ? new Date(e.endsAt) : null,
    eventName: e.title,
    eventColor: CATEGORY_COLOR[e.category as CalendarCategory] ?? 'sky',
  }))

  return (
    <CalendarProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-4">
          <CalendarTitle />
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            <CalendarNavigation />
            <hr className="w-px h-full bg-gray-200 dark:bg-gray-700/60 border-none mx-1" />
            <CreateEventModal />
          </div>
        </div>

        <div className="sm:flex sm:justify-between sm:items-center mb-4">
          <div className="mb-4 sm:mb-0 mr-2">
            <ul className="flex flex-wrap items-center -m-1">
              {CALENDAR_CATEGORIES.map((c) => (
                <li key={c} className="m-1">
                  <div className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <div className={`w-1 h-3.5 bg-${CATEGORY_COLOR[c]}-500 shrink-0`}></div>
                    <span className="ml-1.5">{CATEGORY_LABEL[c]}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-nowrap -space-x-px">
            <button className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-violet-500 rounded-none first:rounded-l-lg last:rounded-r-lg">Month</button>
            <button className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300 rounded-none first:rounded-l-lg last:rounded-r-lg" disabled>Week</button>
            <button className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300 rounded-none first:rounded-l-lg last:rounded-r-lg" disabled>Day</button>
          </div>
        </div>

        <CalendarTable events={events} />
      </div>
    </CalendarProvider>
  )
}
