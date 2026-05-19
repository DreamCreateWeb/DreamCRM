'use client'

import { Fragment, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { addCalendarEvent } from './actions'
import { CALENDAR_CATEGORIES, CATEGORY_LABEL, type CalendarCategory } from '@/lib/types/calendar'
import { cn } from '@/lib/utils'

function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface DraftRange {
  start: Date
  end: Date
  allDay: boolean
}

interface Props {
  /** Auto-open the modal on mount (used when FullCalendar's drag-select
   *  passes a date range up — we open the modal pre-filled). */
  autoOpen?: boolean
  draft?: DraftRange | null
  onClose?: () => void
}

const RECURRENCE_OPTIONS = [
  { key: '', label: 'Does not repeat' },
  { key: 'FREQ=DAILY', label: 'Daily' },
  { key: 'FREQ=WEEKLY', label: 'Weekly' },
  { key: 'FREQ=WEEKLY;INTERVAL=2', label: 'Every 2 weeks' },
  { key: 'FREQ=MONTHLY', label: 'Monthly' },
  { key: 'FREQ=YEARLY', label: 'Yearly' },
  { key: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Every weekday (Mon–Fri)' },
] as const

export default function CreateEventModal({ autoOpen, draft, onClose }: Props = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState(() => toInputValue(addMinutes(new Date(), 60)))
  const [endsAt, setEndsAt] = useState(() => toInputValue(addMinutes(new Date(), 120)))
  const [category, setCategory] = useState<CalendarCategory>('work')
  const [allDay, setAllDay] = useState(false)
  const [recurrence, setRecurrence] = useState<string>('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Open + prefill when a drag-select draft is passed in.
  useEffect(() => {
    if (autoOpen && draft) {
      setOpen(true)
      setStartsAt(toInputValue(draft.start))
      setEndsAt(toInputValue(draft.end))
      setAllDay(draft.allDay)
    }
  }, [autoOpen, draft])

  function close() {
    setOpen(false)
    onClose?.()
  }

  function reset() {
    setTitle('')
    setLocation('')
    setDescription('')
    setRecurrence('')
    setError(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await addCalendarEvent({
          title,
          location: location || null,
          description: description || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          allDay,
          category,
          recurrenceRule: recurrence || null,
        })
        close()
        reset()
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      {/* External trigger — hidden when autoOpen drives the modal. */}
      {!autoOpen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          + Create event
        </button>
      )}

      <Transition show={open} as={Fragment}>
        <Dialog onClose={close} className="relative z-50">
          <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px]" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <DialogPanel className="bg-white dark:bg-stone-900 rounded-xl shadow-xl max-w-md w-full border border-stone-200 dark:border-stone-700/60">
                <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-700/60">
                  <h2 className="font-semibold text-stone-900 dark:text-stone-100">Create event</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-4">
                    <Field label="Title" required>
                      <input
                        className={inputClass}
                        required
                        autoFocus
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Starts">
                        <input
                          type="datetime-local"
                          className={inputClass}
                          required
                          value={startsAt}
                          onChange={(e) => setStartsAt(e.target.value)}
                        />
                      </Field>
                      <Field label="Ends">
                        <input
                          type="datetime-local"
                          className={inputClass}
                          required
                          value={endsAt}
                          onChange={(e) => setEndsAt(e.target.value)}
                        />
                      </Field>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Field label="Repeats">
                        <select
                          className={inputClass}
                          value={recurrence}
                          onChange={(e) => setRecurrence(e.target.value)}
                        >
                          {RECURRENCE_OPTIONS.map((r) => (
                            <option key={r.key} value={r.key}>{r.label}</option>
                          ))}
                        </select>
                      </Field>
                      <label className="flex items-center gap-1.5 text-[12px] text-stone-700 dark:text-stone-200 mt-5">
                        <input
                          type="checkbox"
                          checked={allDay}
                          onChange={(e) => setAllDay(e.target.checked)}
                        />
                        All day
                      </label>
                    </div>

                    <Field label="Location">
                      <input
                        className={inputClass}
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Optional"
                      />
                    </Field>

                    <Field label="Category">
                      <select
                        className={inputClass}
                        value={category}
                        onChange={(e) => setCategory(e.target.value as CalendarCategory)}
                      >
                        {CALENDAR_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Notes">
                      <textarea
                        className={cn(inputClass, 'resize-none')}
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional"
                      />
                    </Field>

                    {error && (
                      <div className="text-[12px] text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                    )}
                  </div>
                  <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-700/60 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={close}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending || !title.trim()}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white disabled:opacity-50"
                    >
                      {pending ? 'Saving…' : 'Create event'}
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </div>
      {children}
    </label>
  )
}

const inputClass =
  'w-full px-2.5 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/40 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-stone-100/10'

function addMinutes(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMinutes(r.getMinutes() + n)
  return r
}
