'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCents, formatDiscount, type CouponRow, type DiscountType, type CouponSource } from '@/lib/types/shop'
import { createCouponAction, deactivateCouponAction, generateBirthdayCouponsAction } from './actions'

const SOURCE_STYLE: Record<CouponSource, string> = {
  manual: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  birthday: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  loyalty: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
}
const FIELD = 'text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800'

export default function CouponsClient({ coupons }: { coupons: CouponRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('percent')
  const [value, setValue] = useState(15)
  const [singleUse, setSingleUse] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')

  function run(fn: () => Promise<unknown>, after?: () => void) {
    setMsg(null)
    startTransition(async () => {
      try {
        await fn()
        after?.()
        router.refresh()
      } catch (err) {
        setMsg((err as Error).message)
      }
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[72rem] mx-auto">
      <div className="mb-6">
        <Link href="/shop" className="text-[12px] text-stone-500 dark:text-stone-400 hover:underline">← Shop</Link>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mt-1">Coupons</h1>
        <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
          Promo codes for your storefront, plus one-click birthday codes for patients celebrating this month.
        </p>
      </div>

      {/* Create + birthday */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] mb-6">
        <div className="rounded-xl border border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 p-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-3">New code</p>
          <div className="flex flex-wrap items-end gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER10" className={`${FIELD} w-32 uppercase`} />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className={FIELD}>
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
            <input type="number" value={value} onChange={(e) => setValue(parseFloat(e.target.value) || 0)} className={`${FIELD} w-20`} />
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={FIELD} title="Expires (optional)" />
            <label className="flex items-center gap-1.5 text-[12px] text-stone-600 dark:text-stone-300">
              <input type="checkbox" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} className="rounded" /> Single-use
            </label>
            <button
              disabled={isPending}
              onClick={() => run(
                () => createCouponAction({ code, discountType, value, expiresAt: expiresAt || null, singleUse }),
                () => { setCode(''); setExpiresAt('') },
              )}
              className="text-[13px] font-semibold px-3 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
            >
              Add code
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-pink-200 dark:border-pink-500/30 bg-pink-50/50 dark:bg-pink-500/5 p-4">
          <p className="text-[13px] font-semibold text-stone-800 dark:text-stone-100">🎂 Birthday coupons</p>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5 mb-3">Generate single-use 15%-off codes for patients with a birthday this month.</p>
          <button
            disabled={isPending}
            onClick={() => run(async () => { const { created } = await generateBirthdayCouponsAction(); setMsg(`Generated ${created} birthday coupon${created === 1 ? '' : 's'}.`) })}
            className="text-[13px] font-semibold px-3 py-2 rounded-lg bg-pink-600 text-white hover:bg-pink-700"
          >
            Generate this month&apos;s
          </button>
        </div>
      </div>

      {msg && <p className="text-[13px] mb-4 text-stone-600 dark:text-stone-300">{msg}</p>}

      {/* List */}
      {coupons.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-[13px] text-stone-400 dark:text-stone-500">
          No coupons yet.
        </div>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => {
            const expired = c.expiresAt && c.expiresAt.getTime() < Date.now()
            const used = c.singleUse && c.usedAt
            const dead = !c.active || expired || used
            return (
              <div key={c.id} className={`bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700/60 p-3 flex items-center gap-3 ${dead ? 'opacity-60' : ''}`}>
                <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">{c.code}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${SOURCE_STYLE[c.source]}`}>{c.source}</span>
                <span className="text-[13px] text-stone-600 dark:text-stone-300">{formatDiscount(c)}</span>
                {c.minSubtotalCents && <span className="text-[12px] text-stone-400">min {formatCents(c.minSubtotalCents)}</span>}
                {c.patientName && <span className="text-[12px] text-stone-400">· {c.patientName}</span>}
                <span className="ml-auto text-[12px] text-stone-400">
                  {used ? 'Used' : expired ? 'Expired' : !c.active ? 'Inactive' : c.singleUse ? 'Single-use' : 'Active'}
                </span>
                {c.active && !used && (
                  <button disabled={isPending} onClick={() => run(() => deactivateCouponAction(c.id))} className="text-[12px] text-stone-400 hover:text-rose-600">Deactivate</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
