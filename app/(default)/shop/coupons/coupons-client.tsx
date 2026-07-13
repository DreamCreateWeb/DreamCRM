'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCents, formatDiscount, type CouponRow, type DiscountType, type CouponSource } from '@/lib/types/shop'
import { createCouponAction, deactivateCouponAction, generateBirthdayCouponsAction } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import type { PillLegendRow, Tone } from '@/lib/ui/encodings'

// Source is a category (where the code came from), not a lifecycle status, so it
// stays a quiet tag rather than a contract tone.
const SOURCE_STYLE: Record<CouponSource, string> = {
  manual: 'bg-gray-500/15 text-gray-600 dark:text-gray-300',
  birthday: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  loyalty: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
}
const SOURCE_LABEL: Record<CouponSource, string> = { manual: 'Manual', birthday: 'Birthday', loyalty: 'Loyalty' }

const FIELD = 'text-sm px-3 py-2 rounded-[var(--r-sm)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'

const PILL_LEGEND: PillLegendRow[] = [
  { tone: 'ok', label: 'Active', meaning: 'Live — patients can redeem it at checkout' },
  { tone: 'neutral', label: 'Used', meaning: 'A single-use code that has been redeemed' },
  { tone: 'neutral', label: 'Expired', meaning: 'Past its expiry date' },
  { tone: 'neutral', label: 'Inactive', meaning: 'Deactivated by you' },
]

// Derive the lifecycle state + its tone for a coupon row.
function couponState(c: CouponRow): { label: string; tone: Tone } {
  const expired = c.expiresAt != null && c.expiresAt.getTime() < Date.now()
  const used = c.singleUse && c.usedAt != null
  if (used) return { label: 'Used', tone: 'neutral' }
  if (expired) return { label: 'Expired', tone: 'neutral' }
  if (!c.active) return { label: 'Inactive', tone: 'neutral' }
  return { label: c.singleUse ? 'Active · single-use' : 'Active', tone: 'ok' }
}

export default function CouponsClient({ coupons, orgName = 'Your clinic' }: { coupons: CouponRow[]; orgName?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('percent')
  const [value, setValue] = useState(15)
  const [singleUse, setSingleUse] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')

  function run(fn: () => Promise<unknown>, opts?: { after?: () => void; done?: string }) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        opts?.after?.()
        if (opts?.done) setToast(opts.done)
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[72rem] mx-auto">
      <PageHeader
        eyebrow={`Business · ${orgName}`}
        title="Coupons"
        subtitle="Promo codes for your storefront, plus one-click birthday codes for patients celebrating this month."
        legend={<EncodingLegend pills={PILL_LEGEND} />}
        actions={
          <>
            <ActionButton variant="secondary" size="sm" href="/shop">
              ← Back to Shop
            </ActionButton>
            <ActionButton variant="primary" breath size="sm" onClick={() => codeRef.current?.focus()}>
              + New coupon
            </ActionButton>
          </>
        }
      />

      {/* Create + birthday */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] mb-6">
        <div className="v2-card p-4">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-3">
            New code
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SUMMER10"
              className={`${FIELD} w-32 uppercase`}
            />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className={FIELD}>
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
              className={`${FIELD} w-20 tabular-nums font-mono-num`}
            />
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={FIELD}
              title="Expires (optional)"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={singleUse}
                onChange={(e) => setSingleUse(e.target.checked)}
                className="rounded"
              />{' '}
              Single-use
            </label>
            <ActionButton
              variant="primary"
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(() => createCouponAction({ code, discountType, value, expiresAt: expiresAt || null, singleUse }), {
                  after: () => {
                    setCode('')
                    setExpiresAt('')
                  },
                  done: 'Coupon added.',
                })
              }
            >
              Add code
            </ActionButton>
          </div>
        </div>
        <div className="rounded-[var(--r-lg)] ring-1 ring-inset ring-pink-300/60 dark:ring-pink-500/30 bg-pink-50/50 dark:bg-pink-500/5 p-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">🎂 Birthday coupons</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
            Generate single-use 15%-off codes for patients with a birthday this month.
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const { created } = await generateBirthdayCouponsAction()
                setToast(`Generated ${created} birthday coupon${created === 1 ? '' : 's'}.`)
              })
            }
            className="btn-sm text-sm font-semibold bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-60"
          >
            Generate this month&apos;s
          </button>
        </div>
      </div>

      {error && <p className="text-sm mb-4 text-rose-700 dark:text-rose-300">{error}</p>}

      {/* List */}
      {coupons.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="No coupons yet"
          body="Add a promo code above, or generate this month's birthday codes — they apply automatically at checkout."
        />
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => {
            const state = couponState(c)
            const dead = state.tone === 'neutral'
            return (
              <div
                key={c.id}
                className={`v2-card p-3 flex items-center gap-3 ${
                  dead ? 'opacity-60' : ''
                }`}
              >
                <span className="font-mono-num text-sm font-semibold text-gray-800 dark:text-gray-100">{c.code}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] ${SOURCE_STYLE[c.source]}`}>
                  {SOURCE_LABEL[c.source]}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300 tabular-nums font-mono-num">{formatDiscount(c)}</span>
                {c.minSubtotalCents != null && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    min <span className="font-mono-num">{formatCents(c.minSubtotalCents)}</span>
                  </span>
                )}
                {c.patientName && <span className="text-xs text-gray-500 dark:text-gray-400">· {c.patientName}</span>}
                <StatusPill tone={state.tone} label={state.label} className="ml-auto" />
                {c.active && state.tone === 'ok' && (
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => deactivateCouponAction(c.id), { done: `${c.code} deactivated.` })}
                  >
                    Deactivate
                  </ActionButton>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
