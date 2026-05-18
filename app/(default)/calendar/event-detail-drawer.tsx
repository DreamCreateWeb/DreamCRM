'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  CALENDAR_CATEGORIES,
  CATEGORY_LABEL,
  type CalendarCategory,
} from '@/lib/types/calendar'
import Drawer from '@/components/ui/drawer'
import type { CalendarEventRow } from './calendar-table'
import { editCalendarEvent, removeCalendarEvent } from './actions'

interface Props {
  event: CalendarEventRow | null
  onClose: () => void
}

/**
 * Right-side drawer for viewing + editing an existing calendar event.
 * Opens when the user clicks any event chip across month/week/day views.
 * "Delete" is destructive but doesn't double-confirm — the row goes away
 * immediately and the user can recreate from the Compose button if they
 * regret it. Could add an undo toast later.
 */
export default function EventDetailDrawer({ event, onClose }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [category, setCategory] = useState<CalendarCategory>('work')

  // Whenever the event prop changes, hydrate the form state. The form is
  // hidden behind the `editing` toggle but pre-populating makes the
  // edit-on-click path a single click rather than two.
  useEffect(() => {
    if (!event) return
    setTitle(event.title)
    setDescription(event.description ?? '')
    setLocation(event.location ?? '')
    setStartsAt(toInputValue(event.startsAt))
    setEndsAt(toInputValue(event.endsAt))
    setAllDay(event.allDay)
    setCategory(event.category as CalendarCategory)
    setEditing(false)
    setError(null)
  }, [event])

  function handleSave() {
    if (!event) return
    setError(null)
    startTransition(async () => {
      try {
        await editCalendarEvent(event.id, {
          title,
          description: description || null,
          location: location || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          allDay,
          category,
        })
        setEditing(false)
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  function handleDelete() {
    if (!event) return
    startTransition(async () => {
      try {
        await removeCalendarEvent(event.id)
        onClose()
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <Drawer
      open={!!event}
      onClose={onClose}
      title={event?.title ?? 'Event'}
      actions={
        event && !editing ? (
          <>
            <button
              onClick={() => setEditing(true)}
              className="px-2 py-1 text-[12px] font-medium rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-800"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={pending}
              className="px-2 py-1 text-[12px] font-medium rounded-md text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/10 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        ) : null
      }
      footer={
        editing ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-rose-600 dark:text-rose-400 min-w-0 truncate">
              {error ?? ''}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-[12px] font-medium rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={pending || !title.trim()}
                className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : null
      }
    >
      {event && !editing && <ReadOnly event={event} />}
      {event && editing && (
        <div className="px-5 py-4 space-y-4">
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Ends">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-stone-700 dark:text-stone-200">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          <Field label="Location">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CalendarCategory)}
              className={inputClass}
            >
              {CALENDAR_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Notes, agenda, attendees…"
              className={cn(inputClass, 'resize-none')}
            />
          </Field>
        </div>
      )}
    </Drawer>
  )
}

function ReadOnly({ event }: { event: CalendarEventRow }) {
  return (
    <div className="px-5 py-4 space-y-4">
      <Row label="When">
        <div className="text-[13px] text-stone-800 dark:text-stone-200">
          {event.allDay
            ? `${event.startsAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · All day`
            : `${event.startsAt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, ${event.startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${event.endsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
        </div>
      </Row>
      {event.location && (
        <Row label="Where">
          <div className="text-[13px] text-stone-800 dark:text-stone-200">{event.location}</div>
        </Row>
      )}
      <Row label="Category">
        <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5 bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
          {CATEGORY_LABEL[event.category as CalendarCategory] ?? event.category}
        </span>
      </Row>
      {event.description && (
        <Row label="Notes">
          <p className="text-[13px] text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
            {event.description}
          </p>
        </Row>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1">{label}</div>
      {children}
    </label>
  )
}

const inputClass =
  'w-full px-2.5 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/40 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-stone-100/10'

function toInputValue(d: Date): string {
  // datetime-local needs YYYY-MM-DDTHH:mm without seconds or timezone.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
