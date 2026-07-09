'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { addProspectAction } from './admin-actions'

/**
 * "Add a clinic" — the manual on-ramp into Prospecting for a practice the owner
 * cold-called (discovery otherwise only fills the pipeline from NPPES). One
 * form does both jobs: add the clinic, and — if they booked a demo on the call
 * — log it as a real scheduled meeting in the same step.
 *
 * The demo time is captured as the owner's LOCAL wall-clock (datetime-local)
 * and converted to a UTC ISO string HERE, in the browser, before it's sent —
 * the server runs in UTC, so parsing a bare wall-clock there would file a 2pm
 * demo at the wrong instant.
 */
export default function AddClinicButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [bookedDemo, setBookedDemo] = useState(false)
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
    setError(null)
    setOk(null)
    setBookedDemo(false)
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(null)
    const form = new FormData(e.currentTarget)
    const demoLocal = (form.get('demoAt') as string) || ''
    // Local wall-clock → UTC ISO in the owner's browser tz.
    let demoAt = ''
    if (bookedDemo && demoLocal) {
      const when = new Date(demoLocal)
      if (Number.isNaN(when.getTime())) {
        setError('That demo date/time doesn’t look right.')
        return
      }
      demoAt = when.toISOString()
    }
    const payload = {
      name: (form.get('name') as string) ?? '',
      contactName: (form.get('contactName') as string) ?? '',
      phone: (form.get('phone') as string) ?? '',
      email: (form.get('email') as string) ?? '',
      city: (form.get('city') as string) ?? '',
      state: (form.get('state') as string) ?? '',
      websiteUrl: (form.get('websiteUrl') as string) ?? '',
      demoAt,
      demoNote: (form.get('demoNote') as string) ?? '',
    }
    startTransition(async () => {
      const res = await addProspectAction(payload)
      if (res.ok) {
        setOk(res.demoLogged ? 'Added — and the demo is on your calendar.' : 'Clinic added to your pipeline.')
        router.refresh()
        setTimeout(close, 1100)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <>
      <ActionButton variant="primary" onClick={() => setOpen(true)}>
        ＋ Add a clinic
      </ActionButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div className="w-full max-w-lg rounded-[var(--r-lg)] bg-[color:var(--color-surface)] p-5 shadow-xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add a clinic</h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  A practice you called. It lands in your pipeline as a warm lead — no cold emails go out.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="ac-name" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Practice name<span className="text-rose-500"> *</span>
                </label>
                <input id="ac-name" name="name" required className="form-input w-full" placeholder="Bright Smiles Dental" disabled={pending} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ac-contact" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Contact
                  </label>
                  <input id="ac-contact" name="contactName" className="form-input w-full" placeholder="Dr. Rivera" disabled={pending} />
                </div>
                <div>
                  <label htmlFor="ac-phone" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Phone
                  </label>
                  <input id="ac-phone" name="phone" inputMode="tel" className="form-input w-full" placeholder="(555) 123-4567" disabled={pending} />
                </div>
              </div>

              <div>
                <label htmlFor="ac-email" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Email
                </label>
                <input id="ac-email" name="email" type="email" className="form-input w-full" placeholder="frontdesk@brightsmiles.com" disabled={pending} />
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] gap-3">
                <div>
                  <label htmlFor="ac-city" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    City
                  </label>
                  <input id="ac-city" name="city" className="form-input w-full" placeholder="Rogers" disabled={pending} />
                </div>
                <div>
                  <label htmlFor="ac-state" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    State
                  </label>
                  <input id="ac-state" name="state" maxLength={2} className="form-input w-16 uppercase" placeholder="AR" disabled={pending} />
                </div>
                <div>
                  <label htmlFor="ac-site" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Website
                  </label>
                  <input id="ac-site" name="websiteUrl" className="form-input w-full" placeholder="brightsmiles.com" disabled={pending} />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={bookedDemo} onChange={(e) => setBookedDemo(e.target.checked)} disabled={pending} />
                I booked a demo with them
              </label>

              {bookedDemo && (
                <div className="space-y-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] p-3">
                  <div>
                    <label htmlFor="ac-demo" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Demo date &amp; time<span className="text-rose-500"> *</span>
                    </label>
                    <input id="ac-demo" name="demoAt" type="datetime-local" required={bookedDemo} className="form-input w-full" disabled={pending} />
                  </div>
                  <div>
                    <label htmlFor="ac-demo-note" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Note (optional)
                    </label>
                    <input id="ac-demo-note" name="demoNote" className="form-input w-full" placeholder="Wants to see the website builder + reviews loop" disabled={pending} />
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
              {ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">{ok}</p>}

              <div className="flex items-center justify-end gap-2 pt-1">
                <ActionButton type="button" variant="secondary" onClick={close} disabled={pending}>
                  Cancel
                </ActionButton>
                <ActionButton type="submit" variant="primary" disabled={pending}>
                  {pending ? 'Adding…' : bookedDemo ? 'Add + log demo' : 'Add clinic'}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
