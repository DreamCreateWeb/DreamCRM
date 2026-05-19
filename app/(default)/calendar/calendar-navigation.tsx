'use client'

import {
  useCalendarContext,
  startOfWeek,
  isSameDay,
  formatMonthYear,
  formatWeekRange,
  formatDayLabel,
  type CalendarView,
} from './calendar-context'

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
  { key: 'list', label: 'List' },
]

/**
 * Top bar for the calendar: shows the current period title, Today button,
 * prev/next chevrons, and the view switcher. Drives FullCalendar via its
 * API (exposed through CalendarContext) so the chrome stays consistent
 * with the rest of the platform admin design rather than using
 * FullCalendar's default toolbar.
 */
export default function CalendarNavigation() {
  const { view, setView, anchor, goToToday, prev, next, today } = useCalendarContext()

  const periodLabel =
    view === 'month'
      ? formatMonthYear(anchor)
      : view === 'week' || view === 'list'
        ? formatWeekRange(startOfWeek(anchor))
        : formatDayLabel(anchor)

  const isOnToday = view === 'day' ? isSameDay(anchor, today) : false

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 mr-2">
        <button
          onClick={prev}
          className="p-1.5 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800 transition-colors"
          title="Previous"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="min-w-[12rem] text-center text-sm font-semibold text-stone-800 dark:text-stone-100">
          {periodLabel}
        </div>
        <button
          onClick={next}
          className="p-1.5 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800 transition-colors"
          title="Next"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <button
        onClick={goToToday}
        disabled={isOnToday}
        className="text-xs font-medium px-2.5 py-1 rounded-md border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-default"
      >
        Today
      </button>

      <div className="flex items-center rounded-md border border-stone-200 dark:border-stone-700 p-0.5 bg-white dark:bg-stone-900">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={
              v.key === view
                ? 'text-xs font-medium px-2.5 py-1 rounded bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                : 'text-xs font-medium px-2.5 py-1 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
            }
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
