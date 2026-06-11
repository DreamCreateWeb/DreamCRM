'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { ActionButton } from '@/components/ui/action-button'
import { createPartnerAction } from './admin-actions'

/**
 * Platform-admin "+ Add partner": creates a referral partner, sets their
 * default commission rate + term, and emails them an accept-invite link.
 */
export default function AddPartnerModal() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [percent, setPercent] = useState('10')
  const [termMonths, setTermMonths] = useState('') // blank = ongoing
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [createdEmail, setCreatedEmail] = useState<string | null>(null)

  function reset() {
    setName(''); setCompany(''); setEmail(''); setPercent('10'); setTermMonths('')
    setNote(''); setError(null); setCreatedEmail(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const pct = Number(percent)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('Percentage must be between 0 and 100')
      return
    }
    const months = termMonths.trim() === '' ? null : Number(termMonths)
    if (months != null && (!Number.isInteger(months) || months < 1)) {
      setError('Term must be a whole number of months, or blank for ongoing')
      return
    }
    startTransition(async () => {
      try {
        const r = await createPartnerAction({
          name,
          company: company || undefined,
          email,
          defaultPercentBps: Math.round(pct * 100),
          defaultTermMonths: months,
          termsNote: note || undefined,
        })
        setCreatedEmail(r.email)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      <ActionButton variant="primary" breath onClick={() => setOpen(true)}>
        + Add partner
      </ActionButton>

      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
            leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/40" aria-hidden="true" />
          </TransitionChild>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
              <DialogPanel className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-lg p-6">
                {createdEmail ? (
                  <div className="text-center py-4">
                    <div className="text-3xl mb-3" aria-hidden="true">📨</div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                      Invite sent to {createdEmail}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                      When they accept, they’ll set up their partner account and can connect a payout method.
                    </p>
                    <div className="flex justify-center gap-2">
                      <ActionButton variant="secondary" onClick={() => reset()}>Add another</ActionButton>
                      <ActionButton variant="primary" onClick={() => { reset(); setOpen(false) }}>Done</ActionButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Add a referral partner</h2>
                    <form onSubmit={onSubmit} className="space-y-4">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ap-name">
                            Name <span className="text-rose-500">*</span>
                          </label>
                          <input id="ap-name" className="form-input w-full" required value={name}
                            onChange={(e) => setName(e.target.value)} placeholder="Jordan Reyes" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ap-company">Company</label>
                          <input id="ap-company" className="form-input w-full" value={company}
                            onChange={(e) => setCompany(e.target.value)} placeholder="Brightline IT" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="ap-email">
                          Email <span className="text-rose-500">*</span>
                        </label>
                        <input id="ap-email" className="form-input w-full" type="email" required value={email}
                          onChange={(e) => setEmail(e.target.value)} placeholder="jordan@brightline.io" />
                      </div>
                      <div className="flex gap-3">
                        <div className="w-32">
                          <label className="block text-sm font-medium mb-1" htmlFor="ap-percent">
                            Commission %
                          </label>
                          <input id="ap-percent" className="form-input w-full" type="number" min={0} max={100} step="0.5"
                            value={percent} onChange={(e) => setPercent(e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ap-term">
                            Term (months)
                          </label>
                          <input id="ap-term" className="form-input w-full" type="number" min={1}
                            value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="Blank = ongoing" />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Leave blank to pay commission for as long as the clinic subscribes.
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="ap-note">Terms note</label>
                        <textarea id="ap-note" className="form-textarea w-full" rows={2} value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="What the partner agreed to — they’ll see this in their portal." />
                      </div>

                      {error && (
                        <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <ActionButton variant="secondary" onClick={() => setOpen(false)}>Cancel</ActionButton>
                        <ActionButton type="submit" variant="primary" disabled={pending}>
                          {pending ? 'Creating…' : 'Create & send invite'}
                        </ActionButton>
                      </div>
                    </form>
                  </>
                )}
              </DialogPanel>
            </div>
          </TransitionChild>
        </Dialog>
      </Transition>
    </>
  )
}
