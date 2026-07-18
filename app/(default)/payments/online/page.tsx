import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listRecentBalancePayments, canTakeBalancePayments } from '@/lib/services/balance-payments'
import { listRecentBookingDeposits } from '@/lib/services/booking-deposits'
import { getBalanceOutreachSettings } from '@/lib/services/balance-outreach'
import BalanceOutreachCard from './balance-outreach-card'
import { formatCents } from '@/lib/types/shop'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Online payments - DreamCRM' }
export const dynamic = 'force-dynamic'

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function ShopPaymentsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [payments, deposits, outreach, paymentsReady] = await Promise.all([
    listRecentBalancePayments(ctx.organizationId),
    listRecentBookingDeposits(ctx.organizationId),
    getBalanceOutreachSettings(ctx.organizationId),
    canTakeBalancePayments(ctx.organizationId),
  ])
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      <PageHeader
        eyebrow={`Business · ${ctx.organizationName}`}
        title="Online payments"
        subtitle="Balance payments patients made online through the portal. Post each one to your PMS ledger to keep the books square — DreamCRM never edits the PMS balance for you."
        actions={
          <div className="flex items-center gap-2">
            {(ctx.role === 'owner' || ctx.role === 'admin') && (
              <ActionButton variant="ghost" size="sm" href="/payments/online/export" target="_blank">
                Export CSV
              </ActionButton>
            )}
            <ActionButton variant="secondary" size="sm" href="/payments/collections">
              Collections board →
            </ActionButton>
            <ActionButton variant="secondary" size="sm" href="/payments">
              ← Back to Payments
            </ActionButton>
          </div>
        }
      />

      {/* Honest framing: these are collected, but reconciliation is still manual. */}
      <div className="mb-5 rounded-[var(--r-md)] bg-violet-500/10 ring-1 ring-inset ring-violet-500/30 px-4 py-3">
        <p className="text-sm text-violet-900 dark:text-violet-200">
          The money has settled to your connected Stripe account. These are a
          record for reconciliation — mark each amount against the patient&rsquo;s
          balance in your PMS so the clinical ledger stays accurate.
        </p>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon="💳"
          title="No online payments yet"
          body="When a patient pays a balance from their portal, it lands here so you can post it to your PMS ledger."
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)] text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Patient
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">
                  Amount
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Paid
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">
                  Balance at payment
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-hairline)]">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/patients/${p.patientId}`}
                      className="font-medium text-gray-800 dark:text-gray-100 hover:underline"
                    >
                      {p.patientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono-num font-semibold text-gray-800 dark:text-gray-100">
                    {formatCents(p.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums font-mono-num">
                    {fmtDate(p.paidAt ?? p.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono-num text-gray-600 dark:text-gray-300">
                    {p.balanceCentsAtPayment == null ? '—' : formatCents(p.balanceCentsAtPayment)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone="ok" label="Paid" title="Payment captured by Stripe" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Booking deposits — collected at website booking, credited toward the
          visit. Only renders once one exists (most clinics charge none). */}
      {deposits.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Booking deposits</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Collected at website booking and credited toward the visit — post each to the
                patient&rsquo;s PMS ledger like any other payment.
              </p>
            </div>
            {(ctx.role === 'owner' || ctx.role === 'admin') && (
              <ActionButton variant="ghost" size="sm" href="/payments/online/deposits-export" target="_blank">
                Export CSV
              </ActionButton>
            )}
          </div>
          <div className="v2-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)] text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Patient</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Visit type</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Amount</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Paid</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-hairline)]">
                {deposits.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                    <td className="px-4 py-3">
                      <Link href={`/patients/${d.patientId}`} className="font-medium text-gray-800 dark:text-gray-100 hover:underline">
                        {d.patientName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">
                      {d.visitType.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono-num font-semibold text-gray-800 dark:text-gray-100">
                      {formatCents(d.amountCents)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums font-mono-num">
                      {fmtDate(d.paidAt ?? d.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone="ok" label="Paid" title="Deposit captured by Stripe — credited toward the visit" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BalanceOutreachCard initial={outreach} canManage={canManage} paymentsReady={paymentsReady} />
    </div>
  )
}
