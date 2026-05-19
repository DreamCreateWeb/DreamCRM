'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import rrulePlugin from '@fullcalendar/rrule'
import type { DateSelectArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { useCalendarContext } from './calendar-context'
import EventDetailDrawer from './event-detail-drawer'
import CreateEventModal from './create-event-modal'
import { editCalendarEvent } from './actions'
import { CATEGORY_COLOR, CATEGORY_LABEL, type CalendarCategory } from '@/lib/types/calendar'

export interface CalendarEventRow {
  id: number
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  category: string
  recurrenceRule: string | null
}

/**
 * Calendar grid powered by FullCalendar. Replaces the hand-rolled
 * month/week/day grid I built first — gives us drag-to-reschedule,
 * drag-to-resize, hour-row time-grid week view, drag-select to create,
 * list/agenda view, and recurring events for free.
 *
 * Toolbar is hidden (headerToolbar:false) — our own CalendarNavigation
 * drives the view via a ref to FullCalendar's API so the chrome matches
 * the rest of the platform admin design.
 */
export default function CalendarTable({ events }: { events: CalendarEventRow[] }) {
  const router = useRouter()
  const { view, anchor, setApi } = useCalendarContext()
  const calRef = useRef<FullCalendar | null>(null)
  const [selected, setSelected] = useState<CalendarEventRow | null>(null)
  const [createDraft, setCreateDraft] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null)

  // Hand the FullCalendar API up to the nav so it can call .changeView() /
  // .next() / .prev() / .today() without re-rendering the calendar.
  useEffect(() => {
    setApi(calRef.current?.getApi() ?? null)
    return () => setApi(null)
  }, [setApi])

  // When the context's view changes (e.g. user clicks Month/Week/Day),
  // tell FullCalendar to switch. Keeps the URL/context as the source of
  // truth for view state.
  useEffect(() => {
    const api = calRef.current?.getApi()
    if (!api) return
    const fcView = FC_VIEW[view]
    if (api.view.type !== fcView) api.changeView(fcView)
  }, [view])

  // Same for the anchor date — keep FullCalendar in sync when our nav
  // moves it via prev/next/today.
  useEffect(() => {
    const api = calRef.current?.getApi()
    if (!api) return
    api.gotoDate(anchor)
  }, [anchor])

  // FullCalendar wants EventInput[] (string ids, Date|string start/end,
  // optional `rrule` for recurring). Map our DB rows over.
  const fcEvents: EventInput[] = useMemo(() => {
    return events.map((e): EventInput => {
      const c = (CATEGORY_COLOR[e.category as CalendarCategory] ?? 'sky') as string
      const base = {
        id: String(e.id),
        title: e.title,
        backgroundColor: bgColor(c),
        borderColor: bgColor(c),
        textColor: textColor(c),
        allDay: e.allDay,
        extendedProps: { row: e },
      }
      if (e.recurrenceRule) {
        return {
          ...base,
          // FullCalendar rrule plugin: provide rrule + duration; it
          // expands into N occurrences using startsAt as dtstart.
          rrule: {
            freq: parseRRuleFreq(e.recurrenceRule),
            dtstart: e.startsAt.toISOString(),
            ...parseRRuleExtras(e.recurrenceRule),
          },
          duration: durationMs(e.startsAt, e.endsAt),
        }
      }
      return { ...base, start: e.startsAt, end: e.endsAt }
    })
  }, [events])

  function handleEventClick(arg: EventClickArg) {
    const row = arg.event.extendedProps?.row as CalendarEventRow | undefined
    if (row) setSelected(row)
  }

  // Drag-select an empty time range → open the create modal pre-filled.
  function handleSelect(arg: DateSelectArg) {
    setCreateDraft({ start: arg.start, end: arg.end, allDay: arg.allDay })
    arg.view.calendar.unselect()
  }

  // Drag-to-reschedule (changes start/end by the dragged delta).
  function handleEventDrop(arg: EventDropArg) {
    persistTimeChange(arg.event.id, arg.event.start, arg.event.end, arg.event.allDay).catch((err) => {
      console.warn('[calendar.drag] failed:', err)
      arg.revert()
    })
  }

  // Drag-to-resize (changes end only).
  function handleEventResize(arg: EventResizeDoneArg) {
    persistTimeChange(arg.event.id, arg.event.start, arg.event.end, arg.event.allDay).catch((err) => {
      console.warn('[calendar.resize] failed:', err)
      arg.revert()
    })
  }

  async function persistTimeChange(idStr: string, start: Date | null, end: Date | null, allDay: boolean) {
    if (!start) return
    const id = Number(idStr)
    if (!Number.isInteger(id)) return
    await editCalendarEvent(id, {
      startsAt: start.toISOString(),
      endsAt: (end ?? new Date(start.getTime() + 60 * 60 * 1000)).toISOString(),
      allDay,
    })
    router.refresh()
  }

  return (
    <>
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-3 dcrm-calendar">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, rrulePlugin]}
          initialView={FC_VIEW[view]}
          initialDate={anchor}
          headerToolbar={false}
          height="auto"
          contentHeight="auto"
          expandRows
          stickyHeaderDates
          dayMaxEventRows={4}
          firstDay={0}
          nowIndicator
          editable
          selectable
          selectMirror
          dragRevertDuration={150}
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          slotLabelFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          events={fcEvents}
          eventClick={handleEventClick}
          select={handleSelect}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
        />
      </div>
      <EventDetailDrawer event={selected} onClose={() => setSelected(null)} />
      {createDraft && (
        <CreateEventModal
          autoOpen
          draft={createDraft}
          onClose={() => setCreateDraft(null)}
        />
      )}
    </>
  )
}

// ---------- Helpers ----------

const FC_VIEW: Record<string, string> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
  list: 'listWeek',
}

// Tailwind-ish category color → CSS values for FullCalendar's
// backgroundColor/borderColor/textColor props (FullCalendar doesn't
// accept className-based theming for events).
function bgColor(name: string): string {
  switch (name) {
    case 'sky': return '#bae6fd'
    case 'indigo':
    case 'violet': return '#ddd6fe'
    case 'yellow':
    case 'amber': return '#fde68a'
    case 'green':
    case 'emerald': return '#a7f3d0'
    case 'red':
    case 'rose': return '#fecdd3'
    case 'gray':
    case 'stone': return '#e7e5e4'
    default: return '#bae6fd'
  }
}

function textColor(name: string): string {
  switch (name) {
    case 'sky': return '#075985'
    case 'indigo':
    case 'violet': return '#5b21b6'
    case 'yellow':
    case 'amber': return '#92400e'
    case 'green':
    case 'emerald': return '#065f46'
    case 'red':
    case 'rose': return '#9f1239'
    case 'gray':
    case 'stone': return '#44403c'
    default: return '#075985'
  }
}

function durationMs(start: Date, end: Date): { milliseconds: number } {
  return { milliseconds: Math.max(60_000, end.getTime() - start.getTime()) }
}

function parseRRuleFreq(rule: string): string {
  const m = rule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i)
  return m ? m[1].toLowerCase() : 'weekly'
}

function parseRRuleExtras(rule: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const interval = rule.match(/INTERVAL=(\d+)/i)
  if (interval) out.interval = Number(interval[1])
  const byday = rule.match(/BYDAY=([A-Z,]+)/i)
  if (byday) out.byweekday = byday[1].split(',').map((d) => d.toLowerCase())
  const until = rule.match(/UNTIL=([0-9T]+Z?)/i)
  if (until) out.until = until[1]
  const count = rule.match(/COUNT=(\d+)/i)
  if (count) out.count = Number(count[1])
  return out
}
