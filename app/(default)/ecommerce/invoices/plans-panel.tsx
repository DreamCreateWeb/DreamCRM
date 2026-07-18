'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { formatMoney } from '@/lib/utils'
import {
  archivePlanPrice,
  archivePlanProduct,
  createPlan,
  unarchivePlanPrice,
} from './admin-actions'
import type { AdminProduct } from '@/lib/services/stripe-admin'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ui/confirm-dialog'

export default function PlansPanel({ products }: { products: AdminProduct[] }) {
  return (
    <div className="v2-card">
      <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          Plans & products{' '}
          <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">{products.length}</span>
        </h2>
        <NewPlanButton />
      </header>
      <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
        {products.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No active products in Stripe yet"
            body="Create a plan to start charging clinics."
          />
        ) : (
          products.map((p) => <ProductRow key={p.id} product={p} />)
        )}
      </div>
    </div>
  )
}

function ProductRow({ product }: { product: AdminProduct }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  async function handleArchiveProduct() {
    if (
      !(await confirm({
        title: `Archive ${product.name}?`,
        message: 'Existing subscriptions keep running but no new ones can be created.',
        confirmLabel: 'Archive',
        danger: true,
      }))
    )
      return
    setError(null)
    startTransition(async () => {
      try {
        await archivePlanProduct(product.id)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  function handleTogglePrice(priceId: string, active: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        if (active) await archivePlanPrice(priceId)
        else await unarchivePlanPrice(priceId)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-800 dark:text-gray-100">{product.name}</div>
          {product.description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{product.description}</div>
          )}
          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{product.id}</div>
        </div>
        <ActionButton variant="danger" size="sm" disabled={pending} onClick={handleArchiveProduct}>
          Archive product
        </ActionButton>
      </div>
      {error && <div className="text-xs text-rose-700 dark:text-rose-300 mt-2">{error}</div>}
      <ul className="mt-3 space-y-1">
        {product.prices.map((pr) => (
          <li
            key={pr.id}
            className={`flex items-center justify-between gap-3 text-sm py-1.5 px-3 rounded border ${
              pr.active
                ? 'border-gray-200 dark:border-gray-700/60'
                : 'border-gray-100 dark:border-gray-800 opacity-60'
            }`}
          >
            <div className="min-w-0">
              <span className="font-medium tabular-nums">
                {pr.unitAmountCents != null
                  ? formatMoney(pr.unitAmountCents, pr.currency.toUpperCase())
                  : '—'}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-1">
                {pr.interval ? `/ ${pr.interval}` : '(one-time)'}
              </span>
              {!pr.active && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">archived</span>}
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-mono">{pr.id}</span>
            </div>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => handleTogglePrice(pr.id, pr.active)}
            >
              {pr.active ? 'Archive' : 'Unarchive'}
            </ActionButton>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NewPlanButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [monthly, setMonthly] = useState('')
  const [annual, setAnnual] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await createPlan({
          name,
          description: description || null,
          monthlyPriceDollars: monthly ? Number(monthly) : null,
          annualPriceDollars: annual ? Number(annual) : null,
          currency: 'usd',
        })
        setOpen(false)
        setName('')
        setDescription('')
        setMonthly('')
        setAnnual('')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      <ActionButton variant="primary" size="sm" onClick={() => setOpen(true)}>
        + New plan
      </ActionButton>
      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-gray-900/60" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">New plan</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Creates a Stripe product + the monthly / annual prices you specify.
                  </p>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Plan name <span className="text-rose-500">*</span></label>
                      <input className="form-input w-full" required value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea className="form-textarea w-full" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Monthly ($)</label>
                        <input type="number" step="1" min="0" className="form-input w-full" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="149" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Annual ($)</label>
                        <input type="number" step="1" min="0" className="form-input w-full" value={annual} onChange={(e) => setAnnual(e.target.value)} placeholder="1490" />
                      </div>
                    </div>
                    {error && (
                      <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-2">
                    <ActionButton variant="secondary" size="sm" onClick={() => setOpen(false)}>
                      Cancel
                    </ActionButton>
                    <ActionButton variant="primary" size="sm" type="submit" disabled={pending || !name}>
                      {pending ? 'Creating…' : 'Create plan'}
                    </ActionButton>
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
