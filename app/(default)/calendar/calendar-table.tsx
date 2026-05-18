'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useCalendarContext, addDays, startOfWeek, isSameDay } from './calendar-context'
import EventDetailDrawer from './event-detail-drawer'
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type CalendarCategory,
} from '@/lib/types/calendar'

export interface CalendarEventRow {
  id: number
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  category: string
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Single calendar surface that swaps between Month / Week / Day based on
 * the view in CalendarContext. All three views share the same event-chip
 * styling + click-to-open-drawer behavior, so adding the week/day surfaces
 * is layout-only — no new mutation paths or state.
 */
export default function CalendarTable({ events }: { events: CalendarEventRow[] }) {
  const { view, anchor, today } = useCalendarContext()
  const [selected, setSelected] = useState<CalendarEventRow | null>(null)

  // Index events by day-string for O(1) lookup per cell.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>()
    for (const e of events) {
      const key = dayKey(e.startsAt)
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    // Sort each day's events chronologically.
    Array.from(map.values()).forEach((arr: CalendarEventRow[]) => {
      arr.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    })
    return map
  }, [events])

  return (
    <>
      {view === 'month' && (
        <MonthGrid eventsByDay={eventsByDay} anchor={anchor} today={today} onOpen={setSelected} />
      )}
      {view === 'week' && (
        <WeekGrid eventsByDay={eventsByDay} anchor={anchor} today={today} onOpen={setSelected} />
      )}
      {view === 'day' && (
        <DayList eventsByDay={eventsByDay} anchor={anchor} today={today} onOpen={setSelected} />
      )}
      <EventDetailDrawer event={selected} onClose={() => setSelected(null)} />
    </>
  )
}

// ============================================================
// Month grid
// ============================================================

function MonthGrid({
  eventsByDay,
  anchor,
  today,
  onOpen,
}: {
  eventsByDay: Map<string, CalendarEventRow[]>
  anchor: Date
  today: Date
  onOpen: (e: CalendarEventRow) => void
}) {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startBlankCount = firstOfMonth.getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Always render 6 rows × 7 cols = 42 cells so the grid is a stable size
  // across month switches (avoids layout shift).
  const cells: { date: Date; isCurrentMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - startBlankCount + 1
    const date = new Date(year, month, dayOffset)
    cells.push({ date, isCurrentMonth: date.getMonth() === month })
  }

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-700/60">
        {DAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-2 text-[11px] font-medium text-stone-500 dark:text-stone-400 text-center uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 gap-px bg-stone-200 dark:bg-stone-700/60">
        {cells.map(({ date, isCurrentMonth }) => {
          const dayEvents = eventsByDay.get(dayKey(date)) ?? []
          const isTodayCell = isSameDay(date, today)
          return (
            <div
              key={date.toISOString()}
              className={cn(
                'min-h-[110px] p-1.5 bg-white dark:bg-stone-900',
                !isCurrentMonth && 'bg-stone-50/60 dark:bg-stone-900/60',
              )}
            >
              <div
                className={cn(
                  'text-[11px] font-medium mb-1 inline-flex items-center justify-center w-5 h-5 rounded-full',
                  isTodayCell
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                    : isCurrentMonth
                      ? 'text-stone-700 dark:text-stone-300'
                      : 'text-stone-400 dark:text-stone-600',
                )}
              >
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} compact onClick={() => onOpen(e)} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 pl-1.5">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Week grid — 7 columns, all-day list per day
// ============================================================

function WeekGrid({
  eventsByDay,
  anchor,
  today,
  onOpen,
}: {
  eventsByDay: Map<string, CalendarEventRow[]>
  anchor: Date
  today: Date
  onOpen: (e: CalendarEventRow) => void
}) {
  const weekStart = startOfWeek(anchor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-700/60">
        {days.map((d) => {
          const isTodayCol = isSameDay(d, today)
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'px-3 py-2.5 text-center border-l border-stone-100 dark:border-stone-700/40 first:border-l-0',
                isTodayCol && 'bg-stone-50 dark:bg-stone-800/40',
              )}
            >
              <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium">
                {DAY_LABELS[d.getDay()]}
              </div>
              <div
                className={cn(
                  'text-lg font-semibold mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full',
                  isTodayCol
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                    : 'text-stone-800 dark:text-stone-100',
                )}
              >
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[24rem]">
        {days.map((d) => {
          const dayEvents = eventsByDay.get(dayKey(d)) ?? []
          return (
            <div
              key={d.toISOString()}
              className="px-2 py-2 space-y-1 border-l border-stone-100 dark:border-stone-700/40 first:border-l-0"
            >
              {dayEvents.length === 0 ? (
                <div className="text-[11px] text-stone-300 dark:text-stone-600 text-center pt-2 italic">—</div>
              ) : (
                dayEvents.map((e) => (
                  <EventChip key={e.id} event={e} onClick={() => onOpen(e)} />
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Day view — single column, larger event cards
// ============================================================

function DayList({
  eventsByDay,
  anchor,
  today,
  onOpen,
}: {
  eventsByDay: Map<string, CalendarEventRow[]>
  anchor: Date
  today: Date
  onOpen: (e: CalendarEventRow) => void
}) {
  const dayEvents = eventsByDay.get(dayKey(anchor)) ?? []
  const isTodayView = isSameDay(anchor, today)
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-6">
      <div className="flex items-baseline gap-3 mb-5">
        <div className="text-3xl font-bold text-stone-900 dark:text-stone-100">{anchor.getDate()}</div>
        <div className="text-sm text-stone-500 dark:text-stone-400">
          {anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', year: 'numeric' })}
        </div>
        {isTodayView && (
          <span className="text-[10px] uppercase tracking-wider font-medium bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 px-1.5 py-0.5 rounded">
            Today
          </span>
        )}
      </div>
      {dayEvents.length === 0 ? (
        <div className="text-sm text-stone-400 dark:text-stone-500 italic py-12 text-center">
          No events scheduled for this day.
        </div>
      ) : (
        <div className="space-y-2">
          {dayEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => onOpen(e)}
              className="w-full text-left rounded-lg border border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors p-3"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'w-1 self-stretch rounded-full',
                    categoryBgClass(e.category as CalendarCategory),
                  )}
                />
                <div className="min-w-0 grow">
                  <div className="font-medium text-stone-900 dark:text-stone-100 text-sm">{e.title}</div>
                  <div className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
                    {formatTimeRange(e)}
                    {e.location && <span className="ml-2">· {e.location}</span>}
                  </div>
                  {e.description && (
                    <div className="text-[12px] text-stone-600 dark:text-stone-400 mt-1.5 line-clamp-2">
                      {e.description}
                    </div>
                  )}
                  <div className="mt-2">
                    <CategoryBadge category={e.category as CalendarCategory} />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Shared pieces
// ============================================================

function EventChip({
  event,
  compact,
  onClick,
}: {
  event: CalendarEventRow
  compact?: boolean
  onClick: () => void
}) {
  const cat = event.category as CalendarCategory
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded truncate hover:opacity-90 transition-opacity flex items-center gap-1',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
        categoryFullClass(cat),
      )}
      title={event.title}
    >
      {!compact && !event.allDay && (
        <span className="opacity-80 tabular-nums shrink-0">
          {event.startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      )}
      <span className="truncate font-medium">{event.title}</span>
    </button>
  )
}

function CategoryBadge({ category }: { category: CalendarCategory }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full text-[10px] font-medium px-1.5 py-0.5',
        categoryFullClass(category),
      )}
    >
      {CATEGORY_LABEL[category] ?? category}
    </span>
  )
}

// Mosaic exported color names per category; map them to actual Tailwind
// classes used by the chips/cards. Stronger color for the side bar, soft
// fill for chip backgrounds.
function categoryFullClass(c: CalendarCategory): string {
  const name = CATEGORY_COLOR[c] ?? 'sky'
  switch (name) {
    case 'sky': return 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
    case 'indigo':
    case 'violet': return 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200'
    case 'yellow': return 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
    case 'green':
    case 'emerald': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
    case 'red':
    case 'rose': return 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200'
    case 'gray':
    case 'stone': return 'bg-stone-100 text-stone-800 dark:bg-stone-700 dark:text-stone-200'
    default: return 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
  }
}

function categoryBgClass(c: CalendarCategory): string {
  const name = CATEGORY_COLOR[c] ?? 'sky'
  switch (name) {
    case 'sky': return 'bg-sky-500'
    case 'indigo':
    case 'violet': return 'bg-violet-500'
    case 'yellow': return 'bg-amber-500'
    case 'green':
    case 'emerald': return 'bg-emerald-500'
    case 'red':
    case 'rose': return 'bg-rose-500'
    case 'gray':
    case 'stone': return 'bg-stone-500'
    default: return 'bg-sky-500'
  }
}

function formatTimeRange(e: CalendarEventRow): string {
  if (e.allDay) return 'All day'
  const sameDay = isSameDay(e.startsAt, e.endsAt)
  const startStr = e.startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (sameDay) {
    return `${startStr} – ${e.endsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  return `${e.startsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${startStr} – ${e.endsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
