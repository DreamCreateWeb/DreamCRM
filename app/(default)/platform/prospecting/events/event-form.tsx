'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { suggestEventSlug } from '@/lib/event-capture'
import { US_STATES } from '@/lib/types/us-geo'
import { createEventAction } from './admin-actions'

export default function EventForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await createEventAction(formData)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/platform/prospecting/events/${res.id}`)
    })
  }

  const label = 'block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400'
  const input =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="ev-name" className={label}>Event</label>
        <input
          id="ev-name"
          name="name"
          required
          className={input}
          placeholder="ASDA Annual Session"
          onChange={(e) => {
            if (!slugTouched) setSlug(suggestEventSlug(e.target.value, new Date().getFullYear()))
          }}
        />
      </div>
      <div>
        <label htmlFor="ev-slug" className={label}>Slug (the campaign key)</label>
        <input
          id="ev-slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          className={`${input} font-mono`}
          placeholder="asda-2026"
        />
      </div>
      <div>
        <label htmlFor="ev-org" className={label}>Organizer</label>
        <input id="ev-org" name="organizer" className={input} placeholder="Arkansas State Dental Association" />
      </div>
      <div>
        <label htmlFor="ev-state" className={label}>State</label>
        <select id="ev-state" name="state" className={input} defaultValue="AR">
          <option value="">—</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ev-start" className={label}>Starts</label>
          <input id="ev-start" name="startsOn" type="date" className={input} />
        </div>
        <div>
          <label htmlFor="ev-end" className={label}>Ends</label>
          <input id="ev-end" name="endsOn" type="date" className={input} />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create event'}
        </button>
      </div>
    </form>
  )
}
