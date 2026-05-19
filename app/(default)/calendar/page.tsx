import { CalendarProvider } from './calendar-context'
import CalendarNavigation from './calendar-navigation'
import CalendarTable from './calendar-table'
import CreateEventModal from './create-event-modal'
import { requireTenant } from '@/lib/auth/context'
import { listCalendarEvents } from '@/lib/services/calendar'

export const metadata = {
  title: 'Calendar - DreamCRM',
  description: 'Schedule events, meetings and reminders',
}

export const dynamic = 'force-dynamic'

export default async function Calendar() {
  const ctx = await requireTenant()

  // Fetch a generous window centered on today so prev/next navigation
  // doesn't re-fetch as long as the user stays within ~2 months. Cheap
  // because the events table is small; if it grows we can switch to a
  // narrower fetch keyed off the calendar context anchor.
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59)

  const dbEvents = await listCalendarEvents(ctx.organizationId, { from, to })
  const events = dbEvents.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startsAt: new Date(e.startsAt),
    endsAt: new Date(e.endsAt),
    allDay: e.allDay,
    category: e.category,
    recurrenceRule: e.recurrenceRule,
  }))

  return (
    <CalendarProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Calendar
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <CalendarNavigation />
            <div className="w-px h-6 bg-stone-200 dark:bg-stone-700" />
            <CreateEventModal />
          </div>
        </div>

        <CalendarTable events={events} />
      </div>
    </CalendarProvider>
  )
}
