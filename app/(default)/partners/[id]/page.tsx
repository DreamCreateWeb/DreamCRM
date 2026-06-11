export const metadata = {
  title: 'Partner — DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  getPartner,
  getReferredClinics,
  getPartnerBalance,
  listCommissions,
  listPayouts,
} from '@/lib/services/referrals'
import { PageHeader } from '@/components/ui/page-header'
import { KpiStat } from '@/components/ui/kpi-stat'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import {
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONE,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHOD_TONE,
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_TONE,
  payoutMethodState,
  formatBps,
  formatTerm,
  moneyFromCents,
  moneyExact,
  type CommissionStatus,
  type PayoutStatus,
  type PartnerStatus,
} from '@/lib/types/referrals'
import PartnerTermsEditor from './partner-terms-editor'
import PartnerActions from './partner-actions'
import ReferredClinicsTable from './referred-clinics-table'

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') redirect('/')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/dashboard')

  const { id } = await params
  const partner = await getPartner(id)
  if (!partner) notFound()

  const [clinics, balance, commissions, payouts] = await Promise.all([
    getReferredClinics(id),
    getPartnerBalance(id),
    listCommissions(id),
    listPayouts(id),
  ])

  const status = partner.status as PartnerStatus
  const method = payoutMethodState({
    hasConnectAccount: Boolean(partner.stripeConnectAccountId),
    payoutsEnabled: partner.payoutsEnabled === 1,
  })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <Link href="/partners" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 inline-block">
        ← All partners
      </Link>
      <PageHeader
        eyebrow="Platform · Referral partner"
        title={partner.name}
        subtitle={[partner.company, partner.email].filter(Boolean).join(' · ')}
        legend={
          <EncodingLegend
            pills={[
              { tone: 'warn', label: 'Accrued', meaning: 'Commission owed, not yet paid out.' },
              { tone: 'ok', label: 'Paid', meaning: 'Included in a completed payout.' },
              { tone: 'neutral', label: 'Reversed', meaning: 'Backed out (e.g. refund).' },
            ]}
          />
        }
        actions={
          <PartnerActions
            partnerId={partner.id}
            status={status}
            accruedCents={balance.accruedCents}
            payoutReady={method === 'active'}
          />
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiStat
          label="Status"
          value={<StatusPill tone={PARTNER_STATUS_TONE[status]} label={PARTNER_STATUS_LABELS[status]} />}
        />
        <KpiStat label="Clinics referred" value={clinics.length} />
        <KpiStat
          label="Accrued (unpaid)"
          value={moneyFromCents(balance.accruedCents)}
          tone={balance.accruedCents > 0 ? 'warn' : undefined}
        />
        <KpiStat label="Lifetime paid" value={moneyFromCents(balance.lifetimePaidCents)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Terms editor */}
        <div className="lg:col-span-1">
          <PartnerTermsEditor
            partnerId={partner.id}
            defaultPercentBps={partner.defaultPercentBps}
            defaultTermMonths={partner.defaultTermMonths}
            termsNote={partner.termsNote}
          />
        </div>

        {/* Payout-method status */}
        <div className="lg:col-span-2 v2-card p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Payout method</h2>
          <div className="flex items-center gap-3 mb-2">
            <StatusPill tone={PAYOUT_METHOD_TONE[method]} label={PAYOUT_METHOD_LABELS[method]} />
            {partner.stripeConnectAccountId && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono-num">
                {partner.stripeConnectAccountId}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {method === 'active'
              ? 'The partner has connected a Stripe payout method. You can pay their accrued balance with “Pay now”, or they can withdraw it themselves from their portal.'
              : method === 'pending'
                ? 'The partner started Stripe onboarding but hasn’t finished. They’ll complete it from their portal before any payout can run.'
                : 'The partner hasn’t set up payouts yet. They connect a bank or debit card from their portal — we never see or store their banking details.'}
          </p>
        </div>
      </div>

      {/* Referred clinics */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
          Referred clinics ({clinics.length})
        </h2>
        {clinics.length === 0 ? (
          <EmptyState
            title="No clinics attributed yet"
            body="Attribute clinics to this partner when you create them (the “+ Add clinic” form), or from a clinic’s detail page → Referral card."
          />
        ) : (
          <ReferredClinicsTable partnerId={partner.id} clinics={clinics.map((c) => ({ ...c, startedAt: c.startedAt ? c.startedAt.toISOString() : null }))} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commission ledger */}
        <div className="v2-card p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Commission ledger</h2>
          {commissions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No commission accrued yet. Rows land here automatically when a referred clinic pays a subscription invoice.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 text-sm">
              {commissions.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{c.clinicName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {fmtDate(c.accruedAt)} · {formatBps(c.percentBps)} of {moneyFromCents(c.invoiceTotalCents)} · <span className="font-mono-num">{c.stripeInvoiceId}</span>
                    </div>
                  </div>
                  <StatusPill tone={COMMISSION_STATUS_TONE[c.status as CommissionStatus]} label={COMMISSION_STATUS_LABELS[c.status as CommissionStatus] ?? c.status} />
                  <span className="shrink-0 font-mono-num tabular-nums font-semibold text-gray-900 dark:text-gray-100 w-20 text-right">
                    {moneyExact(c.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Payout history */}
        <div className="v2-card p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Payout history</h2>
          {payouts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No payouts yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 text-sm">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 dark:text-gray-100">{fmtDate(p.createdAt)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {p.stripeTransferId ? <span className="font-mono-num">{p.stripeTransferId}</span> : p.note ?? '—'}
                    </div>
                  </div>
                  <StatusPill
                    tone={(p.status as PayoutStatus) === 'paid' ? 'ok' : 'urgent'}
                    label={(p.status as PayoutStatus) === 'paid' ? 'Paid' : 'Failed'}
                  />
                  <span className="shrink-0 font-mono-num tabular-nums font-semibold text-gray-900 dark:text-gray-100 w-20 text-right">
                    {moneyExact(p.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
