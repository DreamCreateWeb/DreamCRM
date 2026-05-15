'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { addCard } from '../actions'

export default function AddCardModal() {
  const [open, setOpen] = useState(false)
  const [brand, setBrand] = useState('Visa')
  const [last4, setLast4] = useState('')
  const [expMonth, setExpMonth] = useState('12')
  const [expYear, setExpYear] = useState(String(new Date().getFullYear() + 2))
  const [nickname, setNickname] = useState('')
  const [primary, setPrimary] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setLast4('')
    setNickname('')
    setPrimary(false)
    setError(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await addCard({
          brand,
          last4,
          expMonth: parseInt(expMonth, 10),
          expYear: parseInt(expYear, 10),
          nickname: nickname || null,
          primary,
        })
        reset()
        setOpen(false)
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
        Add Card
      </button>

      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/60" aria-hidden="true" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">Add Card</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="card-brand">Brand</label>
                      <select id="card-brand" className="form-select w-full" value={brand} onChange={(e) => setBrand(e.target.value)}>
                        <option>Visa</option>
                        <option>Mastercard</option>
                        <option>Amex</option>
                        <option>Discover</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="card-last4">Last 4 digits <span className="text-red-500">*</span></label>
                      <input
                        id="card-last4"
                        className="form-input w-full"
                        value={last4}
                        onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        required
                        pattern="\d{4}"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="card-mm">Exp Month</label>
                        <input id="card-mm" className="form-input w-full" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} required />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="card-yy">Exp Year</label>
                        <input id="card-yy" className="form-input w-full" value={expYear} onChange={(e) => setExpYear(e.target.value)} required />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="card-nick">Nickname</label>
                      <input id="card-nick" className="form-input w-full" value={nickname} onChange={(e) => setNickname(e.target.value)} />
                    </div>
                    <div className="flex items-center">
                      <input id="card-primary" type="checkbox" className="form-checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
                      <label htmlFor="card-primary" className="text-sm ml-2">Make this my primary card</label>
                    </div>
                    {error && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                    <button type="button" onClick={() => setOpen(false)} className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300">Cancel</button>
                    <button type="submit" disabled={pending} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60">
                      {pending ? 'Adding…' : 'Add Card'}
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
