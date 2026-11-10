'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import Modal from '@/components/ui/modal'
import { isStaleFailure, runAction } from '@/lib/run-action'
import { US_STATES } from '@/lib/types/us-geo'
import { TONE_PILL } from '@/lib/ui/encodings'
import { inviteCallerAction } from '../admin-actions'

/**
 * "Invite a caller" — name, email, daily target, the states they call. The
 * row is created and the 7-day accept link goes out in one step.
 */
export default function InviteCallerModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [dailyTarget, setDailyTarget] = useState('40')
  const [states, setStates] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setName('')
    setEmail('')
    setDailyTarget('40')
    setStates('')
    setNotes('')
    setError(null)
    setSentTo(null)
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const codes = states
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const bad = codes.find((c) => !(US_STATES as readonly string[]).includes(c))
    if (bad) {
      setError(`"${bad}" is not a state code`)
      return
    }
    startTransition(async () => {
      const r = await runAction(() =>
        inviteCallerAction({
          name,
          email,
          dailyTarget: Number(dailyTarget) || 40,
          states: codes,
          notes: notes || undefined,
        }),
      )
      if (!r.ok) {
        setError(r.error)
        if (isStaleFailure(r)) setStale(true)
        return
      }
      setSentTo(r.email)
      router.refresh()
    })
  }

  return (
    <>
      <ActionButton variant="primary" onClick={() => setOpen(true)}>
        + Invite a caller
      </ActionButton>

      <Modal open={open} onClose={() => setOpen(false)} blocking={pending} labelledBy="invite-caller-title" size="lg">
        <div className="p-6">
          {sentTo ? (
            <div className="py-4 text-center">
              <div className="mb-3 text-3xl" aria-hidden="true">
                📨
              </div>
              <h2 id="invite-caller-title" className="mb-2 text-lg font-bold text-gray-800 dark:text-gray-100">
                Invite sent to {sentTo}
              </h2>
              <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                The link is good for 7 days. When they accept, their queue fills on the next outreach tick — or the
                moment they press “Fill my queue”.
              </p>
              <div className="flex justify-center gap-2">
                <ActionButton variant="secondary" onClick={reset}>
                  Invite another
                </ActionButton>
                <ActionButton
                  variant="primary"
                  onClick={() => {
                    reset()
                    setOpen(false)
                  }}
                >
                  Done
                </ActionButton>
              </div>
            </div>
          ) : (
            <>
              <h2 id="invite-caller-title" className="mb-1 text-lg font-bold text-gray-800 dark:text-gray-100">
                Invite a caller
              </h2>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                They get a page of their own — the queue, the script, the outcome keys — and nothing else in the app.
              </p>
              <form onSubmit={submit} className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium" htmlFor="ic-name">
                      Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="ic-name"
                      className="form-input w-full"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Priya Nair"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium" htmlFor="ic-email">
                      Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="ic-email"
                      className="form-input w-full"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="priya@example.com"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-36">
                    <label className="mb-1 block text-sm font-medium" htmlFor="ic-target">
                      Daily target
                    </label>
                    <input
                      id="ic-target"
                      className="form-input w-full"
                      type="number"
                      min={1}
                      max={500}
                      value={dailyTarget}
                      onChange={(e) => setDailyTarget(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Practices their queue is kept at.</p>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium" htmlFor="ic-states">
                      States (optional)
                    </label>
                    <input
                      id="ic-states"
                      className="form-input w-full"
                      value={states}
                      onChange={(e) => setStates(e.target.value)}
                      placeholder="TX, OK, LA"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Two-letter codes. Blank = any state in the pool.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="ic-notes">
                    Notes (yours only)
                  </label>
                  <textarea
                    id="ic-notes"
                    className="form-textarea w-full"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Upwork contract, hours, rate — the caller never sees this."
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className={`rounded-[var(--r-sm)] px-3 py-2 text-sm ${TONE_PILL.urgent}`}
                  >
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <ActionButton variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </ActionButton>
                  {stale ? (
                    <ActionButton variant="primary" onClick={() => window.location.reload()}>
                      Refresh
                    </ActionButton>
                  ) : (
                    <ActionButton type="submit" variant="primary" pending={pending}>
                      Send the invite
                    </ActionButton>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
