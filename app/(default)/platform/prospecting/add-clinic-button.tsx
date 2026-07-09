'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { addProspectAction, type AddProspectResult } from './admin-actions'

/**
 * "Add a clinic" — the manual on-ramp into the pipeline for a practice the owner
 * cold-called (discovery otherwise only fills the pipeline from NPPES). One form
 * does both jobs: add the clinic + (if a demo was booked on the call) log it as
 * a real scheduled meeting, with the AI prep brief pre-warmed.
 *
 * The demo time is captured as the owner's LOCAL wall-clock (datetime-local) and
 * converted to a UTC ISO string HERE, in the browser, before it's sent — the
 * server runs in UTC, so parsing a bare wall-clock there would file the demo at
 * the wrong instant.
 */
type Payload = Record<string, string | boolean>

export default function AddClinicButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<
    { id: string; name: string; city: string | null; status: string } | null
  >(null)
  const [success, setSuccess] = useState<{ prospectId: string; demoLogged: boolean } | null>(null)
  const [bookedDemo, setBookedDemo] = useState(false)
  const [pending, startTransition] = useTransition()
  const lastPayload = useRef<Payload | null>(null)

  function reset() {
    setError(null)
    setDuplicate(null)
    setSuccess(null)
    setBookedDemo(false)
    lastPayload.current = null
  }
  function close() {
    setOpen(false)
    reset()
  }

  function run(payload: Payload) {
    setError(null)
    setDuplicate(null)
    lastPayload.current = payload
    startTransition(async () => {
      const res: AddProspectResult = await addProspectAction(payload)
      if (res.ok) {
        setSuccess({ prospectId: res.prospectId, demoLogged: res.demoLogged })
        router.refresh()
      } else if (res.duplicate) {
        setDuplicate(res.duplicate)
      } else {
        setError(res.error)
      }
    })
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const demoLocal = (form.get('demoAt') as string) || ''
    let demoAt = ''
    if (bookedDemo && demoLocal) {
      const when = new Date(demoLocal) // parsed in the owner's local tz
      if (Number.isNaN(when.getTime())) {
        setError('That demo date/time doesn’t look right.')
        return
      }
      demoAt = when.toISOString()
    }
    run({
      name: (form.get('name') as string) ?? '',
      contactName: (form.get('contactName') as string) ?? '',
      phone: (form.get('phone') as string) ?? '',
      email: (form.get('email') as string) ?? '',
      addressLine1: (form.get('addressLine1') as string) ?? '',
      city: (form.get('city') as string) ?? '',
      state: (form.get('state') as string) ?? '',
      websiteUrl: (form.get('websiteUrl') as string) ?? '',
      note: (form.get('note') as string) ?? '',
      demoAt,
      demoNote: (form.get('demoNote') as string) ?? '',
    })
  }

  function addAnyway() {
    if (lastPayload.current) run({ ...lastPayload.current, force: true })
  }
  function goTo(href: string) {
    close()
    router.push(href)
  }

  const inputCls = 'form-input w-full'
  const labelCls =
    'mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400'

  return (
    <>
      <ActionButton variant="primary" onClick={() => setOpen(true)}>
        ＋ Add a clinic
      </ActionButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800 p-5 sm:p-6">
            {success ? (
              <div className="text-center">
                <div className="mb-2 text-3xl">✅</div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {success.demoLogged ? 'Added — and the demo is on your calendar' : 'Clinic added to your pipeline'}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {success.demoLogged
                    ? 'It’s in your call list, the demo shows in upcoming meetings, and your AI prep brief is being generated.'
                    : 'It’s in your call list as a warm lead — no cold emails go out.'}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {success.demoLogged && (
                    <ActionButton variant="primary" onClick={() => goTo(`/platform/prospecting/demo/${success.prospectId}`)}>
                      Open demo prep →
                    </ActionButton>
                  )}
                  <ActionButton
                    variant={success.demoLogged ? 'secondary' : 'primary'}
                    onClick={() => goTo(`/platform/prospecting?prospect=${success.prospectId}`)}
                  >
                    Open deal room →
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={reset}>
                    Add another
                  </ActionButton>
                </div>
              </div>
            ) : (
              <>
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
                    <label htmlFor="ac-name" className={labelCls}>
                      Practice name<span className="text-rose-500"> *</span>
                    </label>
                    <input id="ac-name" name="name" required className={inputCls} placeholder="Bright Smiles Dental" disabled={pending} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ac-contact" className={labelCls}>Contact</label>
                      <input id="ac-contact" name="contactName" className={inputCls} placeholder="Dr. Rivera" disabled={pending} />
                    </div>
                    <div>
                      <label htmlFor="ac-phone" className={labelCls}>Phone</label>
                      <input id="ac-phone" name="phone" inputMode="tel" className={inputCls} placeholder="(555) 123-4567" disabled={pending} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ac-email" className={labelCls}>Email</label>
                    <input id="ac-email" name="email" type="email" className={inputCls} placeholder="frontdesk@brightsmiles.com" disabled={pending} />
                  </div>

                  <div>
                    <label htmlFor="ac-addr" className={labelCls}>Address</label>
                    <input id="ac-addr" name="addressLine1" className={inputCls} placeholder="123 Main St" disabled={pending} />
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] gap-3">
                    <div>
                      <label htmlFor="ac-city" className={labelCls}>City</label>
                      <input id="ac-city" name="city" className={inputCls} placeholder="Rogers" disabled={pending} />
                    </div>
                    <div>
                      <label htmlFor="ac-state" className={labelCls}>State</label>
                      <input id="ac-state" name="state" maxLength={2} className={`${inputCls} w-16 uppercase`} placeholder="AR" disabled={pending} />
                    </div>
                    <div>
                      <label htmlFor="ac-site" className={labelCls}>Website</label>
                      <input id="ac-site" name="websiteUrl" className={inputCls} placeholder="brightsmiles.com" disabled={pending} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ac-note" className={labelCls}>Call notes</label>
                    <textarea
                      id="ac-note"
                      name="note"
                      rows={2}
                      className={inputCls}
                      placeholder="What they said, what they want to see — feeds your deal room + prep brief"
                      disabled={pending}
                    />
                  </div>

                  <label className="flex items-center gap-2 pt-1 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={bookedDemo} onChange={(e) => setBookedDemo(e.target.checked)} disabled={pending} />
                    I booked a demo with them
                  </label>

                  {bookedDemo && (
                    <div className="space-y-3 rounded-md bg-[color:var(--color-surface-sunk)] p-3">
                      <div>
                        <label htmlFor="ac-demo" className={labelCls}>
                          Demo date &amp; time<span className="text-rose-500"> *</span>
                        </label>
                        <input id="ac-demo" name="demoAt" type="datetime-local" required={bookedDemo} className={inputCls} disabled={pending} />
                      </div>
                      <div>
                        <label htmlFor="ac-demo-note" className={labelCls}>Demo note (optional)</label>
                        <input id="ac-demo-note" name="demoNote" className={inputCls} placeholder="Wants to see the website builder + reviews loop" disabled={pending} />
                      </div>
                    </div>
                  )}

                  {duplicate && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
                      <p className="text-amber-800 dark:text-amber-300">
                        <span className="font-semibold">{duplicate.name}</span>
                        {duplicate.city ? ` (${duplicate.city})` : ''} looks like it’s already in your pipeline.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ActionButton variant="secondary" onClick={() => goTo(`/platform/prospecting?prospect=${duplicate.id}`)}>
                          Open it →
                        </ActionButton>
                        <ActionButton variant="secondary" onClick={addAnyway} disabled={pending}>
                          Add anyway
                        </ActionButton>
                      </div>
                    </div>
                  )}

                  {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <ActionButton type="button" variant="secondary" onClick={close} disabled={pending}>
                      Cancel
                    </ActionButton>
                    <ActionButton type="submit" variant="primary" disabled={pending}>
                      {pending ? 'Adding…' : bookedDemo ? 'Add + log demo' : 'Add clinic'}
                    </ActionButton>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
