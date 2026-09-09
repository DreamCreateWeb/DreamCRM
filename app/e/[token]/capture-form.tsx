'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import { CAPTURE_ROLES, CAPTURE_ROLE_LABELS } from '@/lib/event-capture'
import { downscaleImageFile } from '@/lib/image-downscale'
import { submitCaptureAction } from './actions'

/**
 * Phone-first: big inputs, one screen, the photo optional (a real camera's
 * files land later on the Events tab). After a send the form resets itself
 * for the next attendee — the owner never navigates between people.
 */
export default function CaptureForm({
  token,
  eventName,
  organizer,
}: {
  token: string
  eventName: string
  organizer: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ email: string; delivered: boolean } | null>(null)
  const [pending, startTransition] = useTransition()
  const [loadedAt, setLoadedAt] = useState('')
  const [photoName, setPhotoName] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    setLoadedAt(String(Date.now()))
  }, [done])

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      // Downscale a phone JPEG client-side so the action body stays small.
      const raw = formData.get('photo')
      if (raw instanceof File && raw.size > 0) {
        try {
          const small = await downscaleImageFile(raw)
          formData.set('photo', small)
        } catch {
          /* keep the original */
        }
      } else {
        formData.delete('photo')
      }
      const res = await submitCaptureAction(token, formData)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDone({ email: res.email, delivered: res.delivered })
      formRef.current?.reset()
      setPhotoName(null)
    })
  }

  const label = 'block text-sm font-medium text-gray-700'
  const input =
    'mt-1 w-full rounded-lg border border-gray-300 px-3.5 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30'

  if (done) {
    return (
      <div className="mt-8 rounded-2xl bg-teal-50 p-6 text-center">
        <p className="text-3xl" aria-hidden="true">📸</p>
        <h2 className="mt-2 text-lg font-semibold text-gray-900">
          {done.delivered ? 'Sent!' : 'You’re on the list'}
        </h2>
        <p className="mt-1 text-sm text-gray-700">
          {done.delivered
            ? `Your headshot is on its way to ${done.email}.`
            : `Your headshot will land at ${done.email} once the photos are edited — usually within a day or two.`}
        </p>
        <button
          type="button"
          onClick={() => setDone(null)}
          className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-semibold text-white"
        >
          Next person
        </button>
      </div>
    )
  }

  return (
    <form ref={formRef} action={onSubmit} className="mt-6 space-y-4">
      <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <input type="hidden" name={TIMETRAP_FIELD} value={loadedAt} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-first" className={label}>First name</label>
          <input id="c-first" name="firstName" required autoComplete="given-name" className={input} />
        </div>
        <div>
          <label htmlFor="c-last" className={label}>Last name</label>
          <input id="c-last" name="lastName" autoComplete="family-name" className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="c-email" className={label}>Email (where the photo goes)</label>
        <input id="c-email" name="email" type="email" inputMode="email" required autoComplete="email" className={input} />
      </div>
      <div>
        <label htmlFor="c-practice" className={label}>Practice name</label>
        <input id="c-practice" name="practiceName" required autoComplete="organization" className={input} placeholder="Smile Bright Dental" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="c-role" className={label}>Role</label>
          <select id="c-role" name="role" className={input} defaultValue="dentist">
            {CAPTURE_ROLES.map((r) => (
              <option key={r} value={r}>{CAPTURE_ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="c-city" className={label}>City</label>
          <input id="c-city" name="city" autoComplete="address-level2" className={input} />
        </div>
      </div>

      <div>
        <label htmlFor="c-photo" className={label}>Photo <span className="font-normal text-gray-500">(optional — the camera’s shots come later)</span></label>
        <input
          id="c-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
          className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-800"
        />
        {photoName ? <p className="mt-1 text-xs text-gray-500">{photoName}</p> : null}
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
        <input type="checkbox" name="photoRelease" required className="mt-1 h-5 w-5 rounded border-gray-300 text-teal-600" />
        <span>
          <strong className="font-semibold">Photo release.</strong> Dream Create may take my photo and email it to me.
          It’s mine to use; Dream Create won’t publish it anywhere without asking me first.
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
        <input type="checkbox" name="optIn" className="mt-1 h-5 w-5 rounded border-gray-300 text-teal-600" />
        <span>
          <strong className="font-semibold">Keep me posted.</strong> Yes, {organizer ? `${organizer}’s web partner ` : ''}Dream Create can email me about
          DreamCRM and the member benefit — a note now and then, one-click unsubscribe on every one.
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal-600 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Scanning your practice…' : 'Send my headshot'}
      </button>
      <p className="text-center text-xs text-gray-500">{eventName}</p>
    </form>
  )
}
