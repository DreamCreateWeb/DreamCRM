'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCents } from '@/lib/types/shop'
import {
  BILLING_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  intervalSuffix,
  type PlanRow,
  type MemberRow,
  type PlanStatus,
  type MembershipStatus,
} from '@/lib/types/membership'
import { setPlanStatusAction, deletePlanAction, markBenefitUsedAction } from './actions'

const PLAN_STATUS_STYLE: Record<PlanStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  draft: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  archived: 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400',
}
const MEMBER_STATUS_STYLE: Record<MembershipStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  past_due: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  cancelled: 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400',
}

interface Props {
  plans: PlanRow[]
  members: MemberRow[]
  stats: { activeMembers: number; mrrCents: number }
  publicBase: string | null
}

export default function MembershipsClient({ plans, members, stats, publicBase }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'plans' | 'members'>('plans')
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn()
      router.refresh()
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[88rem] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <Link href="/shop" className="text-[12px] text-stone-500 dark:text-stone-400 hover:underline">← Shop</Link>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mt-1">Membership plans</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
            Recurring cash-pay plans for uninsured patients — predictable revenue, and members visit far more often.
          </p>
        </div>
        <Link href="/shop/memberships/new" className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-semibold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900">
          + New plan
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-sm">
        <Stat label="Active members" value={stats.activeMembers} tone={stats.activeMembers > 0 ? 'ok' : undefined} />
        <Stat label="Recurring / mo" value={formatCents(stats.mrrCents)} tone={stats.mrrCents > 0 ? 'ok' : undefined} />
      </div>

      <div className="flex gap-1 mb-5 border-b border-stone-200 dark:border-stone-700">
        {(['plans', 'members'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-medium -mb-px border-b-2 ${
              tab === t ? 'border-violet-500 text-stone-900 dark:text-stone-100' : 'border-transparent text-stone-500 dark:text-stone-400'
            }`}
          >
            {t === 'plans' ? `Plans (${plans.length})` : `Members (${members.length})`}
          </button>
        ))}
      </div>

      {tab === 'plans' ? (
        <div className="space-y-2.5">
          {plans.length === 0 ? (
            <Empty>No plans yet. Create one to start enrolling members.</Empty>
          ) : (
            plans.map((p) => (
              <div key={p.id} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-900 dark:text-stone-100">{p.name}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${PLAN_STATUS_STYLE[p.status]}`}>{p.status}</span>
                    {p.memberCount > 0 && <span className="text-[11px] text-stone-500 dark:text-stone-400">{p.memberCount} member{p.memberCount === 1 ? '' : 's'}</span>}
                  </div>
                  <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
                    {formatCents(p.priceCents)}{intervalSuffix(p.billingInterval)} · {BILLING_LABELS[p.billingInterval]}
                    {p.discountPercent > 0 ? ` · ${p.discountPercent}% off other care` : ''} · {p.benefits.length} benefit{p.benefits.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[12px] shrink-0">
                  {p.status === 'active' && publicBase && (
                    <a href={publicBase} target="_blank" rel="noopener" className="px-2 py-1 rounded text-stone-500 hover:text-violet-600 dark:text-stone-400">View</a>
                  )}
                  <Link href={`/shop/memberships/${p.id}`} className="px-2 py-1 rounded text-stone-600 hover:text-violet-600 dark:text-stone-300">Edit</Link>
                  {p.status === 'active' ? (
                    <button disabled={isPending} onClick={() => run(() => setPlanStatusAction(p.id, 'archived'))} className="px-2 py-1 rounded text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800">Unpublish</button>
                  ) : (
                    <button disabled={isPending} onClick={() => run(() => setPlanStatusAction(p.id, 'active'))} className="px-2 py-1 rounded font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400">Publish</button>
                  )}
                  <button disabled={isPending} onClick={() => { if (confirm(`Delete "${p.name}"? (Archived instead if it has members.)`)) run(() => deletePlanAction(p.id)) }} className="px-2 py-1 rounded text-stone-400 hover:text-rose-600">Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {members.length === 0 ? (
            <Empty>No members yet. Members appear here once they enroll from your site.</Empty>
          ) : (
            members.map((m) => (
              <div key={m.id} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-stone-100">{m.patientName || m.email}</span>
                    <span className={`ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${MEMBER_STATUS_STYLE[m.status]}`}>{MEMBERSHIP_STATUS_LABELS[m.status]}</span>
                    <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
                      {m.planName}
                      {m.currentPeriodEnd ? ` · renews ${m.currentPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                  </div>
                </div>
                {m.status === 'active' && m.planBenefits.some((b) => b.qty != null) && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-stone-100 dark:border-stone-700/40">
                    {m.planBenefits.filter((b) => b.qty != null).map((b) => {
                      const used = m.benefitsUsed[b.label] ?? 0
                      const exhausted = b.qty != null && used >= b.qty
                      return (
                        <button
                          key={b.label}
                          disabled={isPending || exhausted}
                          onClick={() => run(() => markBenefitUsedAction(m.id, b.label))}
                          className="text-[12px] px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50"
                          title="Log a redemption"
                        >
                          {b.label}: {used}/{b.qty}{exhausted ? '' : ' · +1'}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700/60">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-900 dark:text-stone-100'}`}>{value}</p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-[13px] text-stone-400 dark:text-stone-500">
      {children}
    </div>
  )
}
