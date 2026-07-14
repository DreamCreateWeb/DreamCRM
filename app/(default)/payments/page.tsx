import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCollectionsSnapshot } from '@/lib/services/collections'
import { getMembershipStats } from '@/lib/services/membership'
import { listRecentBalancePayments, canTakeBalancePayments } from '@/lib/services/balance-payments'
import { listPaymentPlans } from '@/lib/services/payment-plans'
import { formatCents } from '@/lib/types/shop'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { StatusPill } from '@/components/ui/status-pill'
import PaymentsHubDoors from './hub-doors'

export const metadata = {
  title: 'Payments - DreamCRM',
  description: 'Online payments, open balances, payment plans, and membership revenue in one place.',
}
export const dynamic = 'force-dynamic'

/**
 * Payments workspace hub — the clinic's money front door (split out of Shop in
 * the 2026-07-14 structure redesign; Weave/Pearly pattern: payments are
 * first-class, membership revenue nests inside them). One KPI story
 * (outstanding → collected → recurring) + doors into the three surfaces.
 * Shop keeps pure commerce (products, orders, coupons, storefront, loyalty).
 */
export default async function PaymentsHubPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [collections, membershipStats, recentPayments, connectReady, plans] = await Promise.all([
    // Best-effort — the hub renders even if a read hiccups.
    getCollectionsSnapshot(ctx.organizationId).catch(() => ({ patientCount: 0, totalOutstandingCents: 0 })),
    getMembershipStats(ctx.organizationId).catch(() => ({ activeMembers: 0, mrrCents: 0 })),
    listRecentBalancePayments(ctx.organizationId).catch(() => []),
    canTakeBalancePayments(ctx.organizationId).catch(() => false),
    listPaymentPlans(ctx.organizationId).catch(() => []),
  ])
  const openPlans = plans.filter((p) => p.status === 'active' || p.status === 'proposed' || p.status === 'past_due')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        eyebrow={`Business · ${ctx.organizationName}`}
        title="Payments"
        subtitle="Money in one place — what patients owe, what came in online, plans on autopay, and your membership revenue."
        actions={
          connectReady ? (
            <StatusPill tone="ok" label="Stripe connected" title="Your connected Stripe account can take payments" />
          ) : (
            <ActionButton variant="primary" size="sm" href="/api/connect/shop/start">
              Connect Stripe
            </ActionButton>
          )
        }
      />

      {!connectReady && (
        <div className="mb-5 rounded-[var(--r-md)] bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/30 px-4 py-3">
          <p className="text-sm text-indigo-900 dark:text-indigo-200">
            Online payments need a connected Stripe account — payouts land in your bank, not ours.
            Until then you can still work the Collections board and track balances.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KpiStat
          label="Outstanding"
          value={formatCents(collections.totalOutstandingCents)}
          tone={collections.patientCount > 0 ? 'warn' : 'ok'}
          href="/payments/collections"
          sub={
            collections.patientCount > 0
              ? `${collections.patientCount} patient${collections.patientCount === 1 ? '' : 's'} with a balance`
              : 'Nothing owed. Nice.'
          }
        />
        <KpiStat
          label="To reconcile"
          value={recentPayments.length}
          tone={recentPayments.length > 0 ? 'warn' : undefined}
          href="/payments/online"
          sub={recentPayments.length > 0 ? 'online payments to post to your PMS' : 'all posted'}
        />
        <KpiStat
          label="Payment plans"
          value={openPlans.length}
          href="/payments/collections"
          sub={openPlans.length > 0 ? 'open plans on autopay' : 'none open'}
        />
        <KpiStat
          label="Recurring"
          value={`${formatCents(membershipStats.mrrCents)}/mo`}
          tone={membershipStats.activeMembers > 0 ? 'ok' : undefined}
          href="/payments/memberships"
          sub={`${membershipStats.activeMembers} member${membershipStats.activeMembers === 1 ? '' : 's'}`}
        />
      </div>

      <PaymentsHubDoors
        collections={collections}
        toReconcile={recentPayments.length}
        connectReady={connectReady}
        membershipStats={membershipStats}
      />
    </div>
  )
}
