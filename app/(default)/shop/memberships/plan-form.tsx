'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BILLING_LABELS, type PlanRow, type BillingInterval, type PlanStatus, type Benefit } from '@/lib/types/membership'
import { savePlanAction } from './actions'

const FIELD = 'w-full text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800'
const LABEL = 'block text-[12px] font-medium text-stone-700 dark:text-stone-200 mb-1'

type BenefitRow = Benefit & { key: string }

export default function PlanForm({ plan }: { plan?: PlanRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(plan?.billingInterval ?? 'annual')
  const [priceDollars, setPriceDollars] = useState(plan ? plan.priceCents / 100 : 0)
  const [discountPercent, setDiscountPercent] = useState(plan?.discountPercent ?? 15)
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? 'draft')
  const [featured, setFeatured] = useState(plan?.featured ?? false)
  const [benefits, setBenefits] = useState<BenefitRow[]>(
    plan && plan.benefits.length > 0
      ? plan.benefits.map((b, i) => ({ key: String(i), label: b.label, qty: b.qty }))
      : [
          { key: 'a', label: '2 cleanings per year', qty: 2 },
          { key: 'b', label: '2 exams per year', qty: 2 },
          { key: 'c', label: 'Routine X-rays', qty: undefined },
        ],
  )

  function submit() {
    setError(null)
    if (!name.trim()) return setError('Plan name is required')
    if (!(Number(priceDollars) > 0)) return setError('Set a price above $0')
    startTransition(async () => {
      try {
        await savePlanAction({
          id: plan?.id,
          name,
          description: description || null,
          billingInterval,
          priceDollars: Number(priceDollars) || 0,
          discountPercent: Number(discountPercent) || 0,
          status,
          featured,
          benefits: benefits.map((b) => ({ label: b.label.trim(), qty: b.qty != null && !isNaN(b.qty) ? Number(b.qty) : undefined })).filter((b) => b.label),
        })
        router.push('/shop/memberships')
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-2xl mx-auto">
      <div className="mb-5">
        <Link href="/shop/memberships" className="text-[12px] text-stone-500 dark:text-stone-400 hover:underline">← Back to memberships</Link>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mt-1">{plan ? 'Edit plan' : 'New membership plan'}</h1>
      </div>

      <div className="space-y-5">
        <div>
          <label className={LABEL}>Plan name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Smile Club" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="No insurance? No problem. One simple yearly fee covers your preventive care." className={`${FIELD} resize-y`} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Billing</label>
            <select value={billingInterval} onChange={(e) => setBillingInterval(e.target.value as BillingInterval)} className={FIELD}>
              {Object.entries(BILLING_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Price ($)</label>
            <input type="number" step="0.01" value={priceDollars} onChange={(e) => setPriceDollars(parseFloat(e.target.value))} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Discount on other care (%)</label>
            <input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(parseInt(e.target.value) || 0)} className={FIELD} />
          </div>
        </div>

        {/* Benefits */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={LABEL + ' mb-0'}>What&apos;s included</label>
            <button onClick={() => setBenefits((b) => [...b, { key: Math.random().toString(36).slice(2), label: '', qty: undefined }])} className="text-[12px] font-medium text-violet-600 dark:text-violet-400">+ Add benefit</button>
          </div>
          <div className="space-y-2">
            {benefits.map((b) => (
              <div key={b.key} className="grid grid-cols-[1fr_4rem_1.5rem] gap-2 items-center">
                <input value={b.label} onChange={(e) => setBenefits((bs) => bs.map((x) => (x.key === b.key ? { ...x, label: e.target.value } : x)))} placeholder="e.g. 2 cleanings per year" className={FIELD} />
                <input type="number" value={b.qty ?? ''} placeholder="qty" onChange={(e) => setBenefits((bs) => bs.map((x) => (x.key === b.key ? { ...x, qty: e.target.value ? parseInt(e.target.value) : undefined } : x)))} className={FIELD} />
                <button onClick={() => setBenefits((bs) => (bs.length > 1 ? bs.filter((x) => x.key !== b.key) : bs))} className="text-stone-400 hover:text-rose-600 text-sm">×</button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-400 mt-1.5">Qty is optional — use it for countable benefits (e.g. 2 cleanings) so staff can track redemptions.</p>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="rounded" /> Feature this plan
        </label>

        <div>
          <label className={LABEL}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)} className={FIELD}>
            <option value="draft">Draft (hidden)</option>
            <option value="active">Active (open for sign-ups)</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {error && <p className="text-[13px] text-rose-600">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button disabled={isPending} onClick={submit} className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900">
            {isPending ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}
          </button>
          <Link href="/shop/memberships" className="text-[13px] text-stone-500 dark:text-stone-400 hover:underline">Cancel</Link>
        </div>
      </div>
    </div>
  )
}
