'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { addCalendarEvent } from './actions'
import { CALENDAR_CATEGORIES, CATEGORY_LABEL, type CalendarCategory } from '@/lib/types/calendar'

function nowLocalInput(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CreateEventModal() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState(nowLocalInput(60))
  const [endsAt, setEndsAt] = useState(nowLocalInput(120))
  const [category, setCategory] = useState<CalendarCategory>('work')
  const [allDay, setAllDay] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await addCalendarEvent({
          title,
          location: location || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          allDay,
          category,
        })
        setOpen(false)
        setTitle('')
        setLocation('')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
      >
        Create Event
      </button>

      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-gray-900/60" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">Create Event</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Title <span className="text-red-500">*</span></label>
                      <input className="form-input w-full" required value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Location</label>
                      <input className="form-input w-full" value={location} onChange={(e) => setLocation(e.target.value)} />
                    </div>
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Start</label>
                        <input type="datetime-local" className="form-input w-full" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">End</label>
                        <input type="datetime-local" className="form-input w-full" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Category</label>
                        <select className="form-select w-full" value={category} onChange={(e) => setCategory(e.target.value as CalendarCategory)}>
                          {CALENDAR_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                          ))}
                        </select>
                      </div>
                      <label className="ml-4 mt-6 flex items-center text-sm">
                        <input type="checkbox" className="form-checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                        <span className="ml-2">All day</span>
                      </label>
                    </div>
                    {error && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                    <button type="button" onClick={() => setOpen(false)} className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300">Cancel</button>
                    <button type="submit" disabled={pending} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60">
                      {pending ? 'Saving…' : 'Create Event'}
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
