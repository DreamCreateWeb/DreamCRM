'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { addOrder } from './actions'

interface CustomerOption {
  id: number
  name: string
}

export default function AddOrderModal({ customers }: { customers: CustomerOption[] }) {
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState<string>('')
  const [total, setTotal] = useState('0.00')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('pending')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const totalCents = Math.round(parseFloat(total || '0') * 100)
        await addOrder({
          customerId: customerId ? Number(customerId) : null,
          totalCents,
          status,
          location: location || null,
          items: [],
        })
        setOpen(false)
        setCustomerId('')
        setTotal('0.00')
        setLocation('')
        setStatus('pending')
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
        <svg className="fill-current shrink-0 xs:hidden" width="16" height="16" viewBox="0 0 16 16">
          <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
        </svg>
        <span className="max-xs:sr-only">Add Order</span>
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
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">Add Order</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="order-customer">Customer</label>
                      <select
                        id="order-customer"
                        className="form-select w-full"
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                      >
                        <option value="">— Walk-in / guest —</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="order-total">
                          Total <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="order-total"
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input w-full"
                          value={total}
                          onChange={(e) => setTotal(e.target.value)}
                          required
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="order-status">Status</label>
                        <select
                          id="order-status"
                          className="form-select w-full"
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                        >
                          {['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="order-location">Location</label>
                      <input
                        id="order-location"
                        className="form-input w-full"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </div>
                    {error && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">
                        {error}
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending}
                      className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60"
                    >
                      {pending ? 'Adding…' : 'Add Order'}
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
