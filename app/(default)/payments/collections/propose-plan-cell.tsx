'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { ActionButton } from '@/components/ui/action-button'
import { proposePlanAction } from './actions'

const MIN_MONTHS = 2
const MAX_MONTHS = 12

/**
 * Per-row "Payment plan" proposer: pick the months (amount = the current
 * balance), see the per-month math live, send. The patient accepts + saves a
 * card at the public /i/[token] page; nothing charges until they do.
 */
export default function ProposePlanCell({
  patientId,
  patientName,
  balanceCents,
  disabled,
  disabledReason,
}: {
  patientId: string
  patientName: string
  balanceCents: number
  disabled?: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState(6)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const money = (c: number) => `$${(c / 100).toFixed(2)}`
  const per = useMemo(() => Math.floor(balanceCents / months), [balanceCents, months])
  const last = balanceCents - per * (months - 1)

  function propose() {
    setError('')
    startTransition(async () => {
      const r = await proposePlanAction({ patientId, totalCents: balanceCents, installments: months })
      if (r.ok) {
        setSent(true)
        setOpen(false)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  if (sent) {
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Plan sent ✓</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? disabledReason : 'Propose splitting this balance into monthly autopay installments'}
        className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-40 disabled:no-underline"
      >
        Payment plan
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
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                    Payment plan for {patientName}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {money(balanceCents)} split into monthly autopay payments. They accept + save a
                    card on a secure page — nothing charges until then.
                  </p>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <label className="block">
                    <span className="block text-sm font-medium mb-1">Monthly payments</span>
                    <select
                      className="form-select w-full"
                      value={months}
                      onChange={(e) => setMonths(Number(e.target.value))}
                    >
                      {Array.from({ length: MAX_MONTHS - MIN_MONTHS + 1 }, (_, i) => MIN_MONTHS + i).map((m) => (
                        <option key={m} value={m}>
                          {m} months
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700/60 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 tabular-nums">
                    {per === last
                      ? `${months} × ${money(per)}`
                      : `${months - 1} × ${money(per)} + final ${money(last)}`}
                    {' '}— first payment when they accept
                  </div>
                  {error && (
                    <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded" role="alert">
                      {error}
                    </div>
                  )}
                </div>
                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                  <ActionButton variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</ActionButton>
                  {/* The modal's single primary action. */}
                  <ActionButton variant="primary" size="sm" onClick={propose} disabled={pending}>
                    {pending ? 'Sending…' : 'Email the proposal'}
                  </ActionButton>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
