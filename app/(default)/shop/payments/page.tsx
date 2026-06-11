import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listRecentBalancePayments } from '@/lib/services/balance-payments'
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

  const payments = await listRecentBalancePayments(ctx.organizationId)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      <PageHeader
        eyebrow={`Business · ${ctx.organizationName}`}
        title="Online payments"
        subtitle="Balance payments patients made online through the portal. Post each one to your PMS ledger to keep the books square — DreamCRM never edits the PMS balance for you."
        actions={
          <ActionButton variant="secondary" size="sm" href="/shop">
            ← Back to Shop
          </ActionButton>
        }
      />

      {/* Honest framing: these are collected, but reconciliation is still manual. */}
      <div className="mb-5 rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-4 py-3">
        <p className="text-sm text-sky-900 dark:text-sky-200">
          The money has settled to your connected Stripe account. These are a
          record for reconciliation — mark each amount against the patient&rsquo;s
          balance in your PMS so the clinical ledger stays accurate.
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <EmptyState
            icon="💳"
            title="No online payments yet"
            body="When a patient pays a balance from their portal, it lands here so you can post it to your PMS ledger."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700/60 text-left">
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
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
                  <td className="px-4 py-3">
                    <Link
                      href={`/patients/${p.patientId}`}
                      className="font-medium text-gray-800 dark:text-gray-100 hover:underline"
                    >
                      {p.patientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                    {formatCents(p.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">
                    {fmtDate(p.paidAt ?? p.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
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
    </div>
  )
}
