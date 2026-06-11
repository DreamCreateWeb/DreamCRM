'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import { FlashToast } from '@/components/ui/flash-toast'
import type { PillLegendRow, Tone } from '@/lib/ui/encodings'

// Plan lifecycle → tone. draft + archived are inert (neutral); active is a live
// plan members can join (ok).
const PLAN_STATUS_TONE: Record<PlanStatus, Tone> = {
  active: 'ok',
  draft: 'neutral',
  archived: 'neutral',
}
const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
}

// Membership lifecycle → tone. active is healthy (ok); past_due needs to be
// chased NOW (urgent); pending is mid-checkout, the ball in the patient's /
// Stripe's court (info); cancelled is terminal (neutral).
const MEMBER_STATUS_TONE: Record<MembershipStatus, Tone> = {
  active: 'ok',
  pending: 'info',
  past_due: 'urgent',
  cancelled: 'neutral',
}

const PLAN_PILL_LEGEND: PillLegendRow[] = [
  { tone: 'ok', label: 'Active', meaning: 'Live on your site — patients can join' },
  { tone: 'neutral', label: 'Draft', meaning: 'Not yet published' },
  { tone: 'neutral', label: 'Archived', meaning: 'Hidden from your site' },
]
const MEMBER_PILL_LEGEND: PillLegendRow[] = [
  { tone: 'ok', label: 'Active', meaning: 'Paid up and current' },
  { tone: 'urgent', label: 'Past due', meaning: 'Payment failed — reach out to keep them enrolled' },
  { tone: 'info', label: 'Pending', meaning: 'Mid-checkout — waiting on the patient to finish' },
  { tone: 'neutral', label: 'Cancelled', meaning: 'No longer a member' },
]

interface Props {
  plans: PlanRow[]
  members: MemberRow[]
  stats: { activeMembers: number; mrrCents: number }
  publicBase: string | null
  orgName?: string
}

export default function MembershipsClient({ plans, members, stats, publicBase, orgName = 'Your clinic' }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'plans' | 'members'>('plans')
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function run(fn: () => Promise<unknown>, done?: string) {
    startTransition(async () => {
      await fn()
      if (done) setToast(done)
      router.refresh()
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[88rem] mx-auto">
      <PageHeader
        eyebrow={`Business · ${orgName}`}
        title="Membership plans"
        subtitle="Recurring cash-pay plans for uninsured patients — predictable revenue, and members visit far more often."
        legend={<EncodingLegend pills={tab === 'plans' ? PLAN_PILL_LEGEND : MEMBER_PILL_LEGEND} />}
        actions={
          <ActionButton variant="primary" size="sm" href="/shop/memberships/new">
            + New plan
          </ActionButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-sm">
        <KpiStat label="Active members" value={stats.activeMembers} tone={stats.activeMembers > 0 ? 'ok' : undefined} />
        <KpiStat label="Recurring / mo" value={formatCents(stats.mrrCents)} tone={stats.mrrCents > 0 ? 'ok' : undefined} />
      </div>

      <div className="flex gap-1 mb-5 border-b border-[color:var(--color-hairline)]">
        {(['plans', 'members'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${
              tab === t
                ? 'border-teal-500 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {t === 'plans' ? `Plans (${plans.length})` : `Members (${members.length})`}
          </button>
        ))}
      </div>

      {tab === 'plans' ? (
        <div className="space-y-2.5">
          {plans.length === 0 ? (
            <EmptyState
              icon="💳"
              title="No plans yet"
              body="Create your first plan to start enrolling members — set a price, the benefits, and an in-house discount."
              action={
                <ActionButton variant="primary" size="sm" href="/shop/memberships/new">
                  + New plan
                </ActionButton>
              }
            />
          ) : (
            plans.map((p) => (
              <div
                key={p.id}
                className="v2-card p-4 flex flex-wrap items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{p.name}</span>
                    <StatusPill tone={PLAN_STATUS_TONE[p.status]} label={PLAN_STATUS_LABEL[p.status]} />
                    {p.memberCount > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                        {p.memberCount} member{p.memberCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                    <span className="font-mono-num">
                      {formatCents(p.priceCents)}
                      {intervalSuffix(p.billingInterval)}
                    </span>{' '}
                    · {BILLING_LABELS[p.billingInterval]}
                    {p.discountPercent > 0 ? ` · ${p.discountPercent}% off other care` : ''} · {p.benefits.length}{' '}
                    benefit{p.benefits.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.status === 'active' && publicBase && (
                    <ActionButton variant="ghost" size="sm" href={publicBase} target="_blank">
                      View ↗
                    </ActionButton>
                  )}
                  <ActionButton variant="ghost" size="sm" href={`/shop/memberships/${p.id}`}>
                    Edit
                  </ActionButton>
                  {p.status === 'active' ? (
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => setPlanStatusAction(p.id, 'archived'), `${p.name} unpublished.`)}
                    >
                      Unpublish
                    </ActionButton>
                  ) : (
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => setPlanStatusAction(p.id, 'active'), `${p.name} is live.`)}
                    >
                      Publish
                    </ActionButton>
                  )}
                  <ActionButton
                    variant="danger"
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      if (confirm(`Delete "${p.name}"? (Archived instead if it has members.)`))
                        run(() => deletePlanAction(p.id), `${p.name} removed.`)
                    }}
                  >
                    Delete
                  </ActionButton>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {members.length === 0 ? (
            <EmptyState
              icon="🦷"
              title="No members yet"
              body="Members appear here once they enroll from your site. Publish a plan and share the link to get started."
            />
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="v2-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.patientId ? (
                        <Link
                          href={`/patients/${m.patientId}`}
                          className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:underline"
                        >
                          {m.patientName || m.email}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {m.patientName || m.email}
                        </span>
                      )}
                      <StatusPill tone={MEMBER_STATUS_TONE[m.status]} label={MEMBERSHIP_STATUS_LABELS[m.status]} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                      {m.planName}
                      {m.currentPeriodEnd ? (
                        <>
                          {' '}
                          · renews{' '}
                          <span className="font-mono-num">
                            {m.currentPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </>
                      ) : (
                        ''
                      )}
                    </p>
                  </div>
                </div>
                {m.status === 'active' && m.planBenefits.some((b) => b.qty != null) && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[color:var(--color-hairline)]">
                    {m.planBenefits
                      .filter((b) => b.qty != null)
                      .map((b) => {
                        const used = m.benefitsUsed[b.label] ?? 0
                        const exhausted = b.qty != null && used >= b.qty
                        return (
                          <button
                            key={b.label}
                            disabled={isPending || exhausted}
                            onClick={() => run(() => markBenefitUsedAction(m.id, b.label), `Logged: ${b.label}.`)}
                            className="text-xs px-2.5 py-1 rounded-[var(--r-sm)] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50 tabular-nums"
                            title="Log a redemption"
                          >
                            {b.label}: <span className="font-mono-num">{used}/{b.qty}</span>
                            {exhausted ? '' : ' · +1'}
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

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
