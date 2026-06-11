export const metadata = {
  title: 'Partner portal — Dream Create',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  getPartnerByUserId,
  getReferredClinics,
  getPartnerBalance,
  listPayouts,
} from '@/lib/services/referrals'
import { refreshPayoutStatus, getPayoutMethodLabel } from '@/lib/services/referral-payouts'
import { KpiStat } from '@/components/ui/kpi-stat'
import { StatusPill } from '@/components/ui/status-pill'
import {
  PAYOUT_MIN_CENTS,
  formatBps,
  formatTerm,
  moneyFromCents,
  moneyExact,
  payoutMethodState,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHOD_TONE,
  type PayoutStatus,
} from '@/lib/types/referrals'
import PartnerPayout from './partner-payout'

const PLAN_LABEL: Record<string, string> = { basic: 'Basic', pro: 'Pro', premium: 'Premium' }

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function PartnerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'partner') redirect('/')

  const partner = await getPartnerByUserId(ctx.userId)
  if (!partner) redirect('/')

  // Returning from (or refreshing) Stripe onboarding → re-pull payout status.
  const { connect } = await searchParams
  if (connect === 'done' || connect === 'refresh') {
    await refreshPayoutStatus(partner.id)
  }

  const [clinics, balance, payouts, methodLabel] = await Promise.all([
    getReferredClinics(partner.id),
    getPartnerBalance(partner.id),
    listPayouts(partner.id),
    partner.payoutsEnabled === 1 ? getPayoutMethodLabel(partner.id) : Promise.resolve(null),
  ])
  // payoutsEnabled may have just been refreshed above; re-read it.
  const fresh = await getPartnerByUserId(ctx.userId)
  const payoutsEnabled = (fresh ?? partner).payoutsEnabled === 1
  const hasConnect = Boolean((fresh ?? partner).stripeConnectAccountId)
  const method = payoutMethodState({ hasConnectAccount: hasConnect, payoutsEnabled })

  const firstName = partner.name.split(' ')[0] || partner.name

  return (
    <div className="space-y-8">
      <div className="aura-chrome -mx-4 sm:-mx-6 px-4 sm:px-6 pt-1 pb-2 rounded-lg">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Your referred clinics, the commission you’ve earned, and your payouts.
        </p>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiStat label="Referred clinics" value={clinics.length} />
        <KpiStat
          label="Accrued balance"
          value={moneyFromCents(balance.accruedCents)}
          tone={balance.accruedCents >= PAYOUT_MIN_CENTS ? 'ok' : undefined}
          sub={
            balance.accruedCents > 0 && balance.accruedCents < PAYOUT_MIN_CENTS
              ? `${moneyExact(PAYOUT_MIN_CENTS)} minimum to withdraw`
              : 'Available to withdraw'
          }
        />
        <KpiStat label="Lifetime paid" value={moneyFromCents(balance.lifetimePaidCents)} />
      </div>

      {/* Payout method + withdraw */}
      <PartnerPayout
        method={method}
        methodLabelText={methodLabel}
        accruedCents={balance.accruedCents}
        payoutMethodPill={{ tone: PAYOUT_METHOD_TONE[method], label: PAYOUT_METHOD_LABELS[method] }}
      />

      {/* Terms (read-only) */}
      <div className="v2-card p-5">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">Your terms</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          You earn <span className="font-mono-num font-semibold">{formatBps(partner.defaultPercentBps)}</span> of every paid
          subscription from clinics you refer
          {partner.defaultTermMonths == null
            ? ' — for as long as they subscribe.'
            : ` — for ${formatTerm(partner.defaultTermMonths)} from when each clinic joins.`}
        </p>
        {partner.termsNote && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{partner.termsNote}</p>
        )}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Some clinics may have a custom rate — see the per-clinic rate below.
        </p>
      </div>

      {/* Referred clinics */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
          Your clinics ({clinics.length})
        </h2>
        {clinics.length === 0 ? (
          <div className="v2-well px-6 py-10 text-center">
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">No clinics yet</div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              When a clinic you referred is added, it’ll show up here and start earning you commission.
            </p>
          </div>
        ) : (
          <div className="v2-card overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Clinic</th>
                  <th className="px-4 py-3 text-left font-semibold">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold">Since</th>
                  <th className="px-4 py-3 text-left font-semibold">Your rate</th>
                  <th className="px-4 py-3 text-right font-semibold">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {clinics.map((c) => (
                  <tr key={c.organizationId}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{PLAN_LABEL[c.planTier] ?? c.planTier}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmtDate(c.startedAt)}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      <span className="font-mono-num">{formatBps(c.percentBps)}</span>
                      <span className="text-gray-400 dark:text-gray-500"> · {formatTerm(c.termMonths)}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {moneyFromCents(c.lifetimeCommissionCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout history */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Payout history</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No payouts yet.</p>
        ) : (
          <div className="v2-card overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusPill
                        tone={(p.status as PayoutStatus) === 'paid' ? 'ok' : 'urgent'}
                        label={(p.status as PayoutStatus) === 'paid' ? 'Paid' : 'Failed'}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num tabular-nums text-gray-900 dark:text-gray-100">
                      {moneyExact(p.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
