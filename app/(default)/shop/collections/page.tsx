import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCollectionsBoard } from '@/lib/services/collections'
import { canTakeBalancePayments } from '@/lib/services/balance-payments'
import { listPaymentPlans } from '@/lib/services/payment-plans'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { formatClinicDateTime } from '@/lib/format-datetime'
import { formatCents } from '@/lib/types/shop'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import SendLinkCell from './send-link-cell'
import ProposePlanCell from './propose-plan-cell'
import PlansCard, { type PlanRowView } from './plans-card'

export const metadata = { title: 'Collections - DreamCRM' }
export const dynamic = 'force-dynamic'

/**
 * The Collections board — every open balance and its dunning state on one
 * screen (Dental Intelligence's AR view, minus the pretend precision).
 * Honest scope: the PMS hands us a point-in-time balance, so true 30/60/90
 * aging waits for an aging data source — the note below says exactly that.
 */
export default async function CollectionsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [board, paymentsReady, tz, plans] = await Promise.all([
    getCollectionsBoard(ctx.organizationId),
    canTakeBalancePayments(ctx.organizationId),
    getClinicTimeZone(ctx.organizationId),
    listPaymentPlans(ctx.organizationId),
  ])
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  const fmtDay = (d: Date | null) =>
    d ? formatClinicDateTime(d, tz).split(',').slice(0, 2).join(',') : '—'

  const planRows: PlanRowView[] = plans.map((p) => ({
    id: p.id,
    patientId: p.patientId,
    patientName: p.patientName,
    totalCents: p.totalCents,
    installmentCents: p.installmentCents,
    installments: p.installments,
    installmentsPaid: p.installmentsPaid,
    status: p.status,
    nextChargeLabel: p.nextChargeAt ? fmtDay(p.nextChargeAt) : null,
    lastError: p.lastError,
  }))
  // Patients with an OPEN plan don't need a second ask from the balance table.
  const onPlan = new Set(
    plans
      .filter((p) => p.status === 'proposed' || p.status === 'active' || p.status === 'past_due')
      .map((p) => p.patientId),
  )

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      <PageHeader
        eyebrow={`Business · ${ctx.organizationName}`}
        title="Collections"
        subtitle="Every open balance and where its follow-up stands — send pay links from here, and watch the paid ones clear on the next PMS sync."
        actions={
          <ActionButton variant="secondary" size="sm" href="/shop/payments">
            Online payments →
          </ActionButton>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiStat
          label="Outstanding"
          value={formatCents(board.totalOutstandingCents)}
          sub={`across ${board.patientCount} ${board.patientCount === 1 ? 'patient' : 'patients'}`}
          tone={board.totalOutstandingCents > 0 ? 'warn' : 'ok'}
        />
        <KpiStat
          label="Pay links out"
          value={`${board.withLinkOut} of ${board.patientCount}`}
          sub={board.patientCount > board.withLinkOut ? `${board.patientCount - board.withLinkOut} still need one` : 'everyone’s been asked'}
          tone={board.patientCount > board.withLinkOut ? 'warn' : 'ok'}
        />
        <KpiStat
          label="Collected online this month"
          value={formatCents(board.collectedThisMonthCents)}
          sub="via portal + pay links"
          tone="ok"
        />
      </div>

      {/* Honest deferral — same posture as the Analytics PMS block. */}
      <div className="mb-5 rounded-[var(--r-md)] bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/30 px-4 py-3">
        <p className="text-sm text-indigo-900 dark:text-indigo-200">
          Balances come from your PMS as a single point-in-time number, so true 30/60/90 aging
          buckets aren&rsquo;t shown yet — we&rsquo;d rather wait for real aging data than guess.
          {!paymentsReady && (
            <>
              {' '}Connect Stripe from{' '}
              <Link href="/shop" className="font-medium underline">your Shop page</Link>{' '}
              to send pay links from this board.
            </>
          )}
        </p>
      </div>

      {planRows.length > 0 && <PlansCard plans={planRows} canManage={canManage} />}

      {board.rows.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="No open balances"
          body="Every patient is square. When the PMS sync brings in a balance, it lands here with its follow-up state."
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)] text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Patient</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Balance</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pay link</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Last online payment</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-hairline)]">
                {board.rows.map((r) => (
                  <tr key={r.patientId}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="font-medium text-gray-800 dark:text-gray-100 hover:underline"
                      >
                        {r.name}
                      </Link>
                      {!r.hasEmail && (
                        <span className="ml-2 text-xs text-gray-400" title="No email on file — pay links need one">
                          no email
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-800 dark:text-gray-100">
                      {formatCents(r.balanceCents)}
                    </td>
                    <td className="px-4 py-3">
                      {r.payLink ? (
                        r.payLink.status === 'paid' ? (
                          <StatusPill tone="ok">Paid</StatusPill>
                        ) : (
                          <span className="text-xs text-gray-600 dark:text-gray-300">
                            Sent {fmtDay(r.payLink.sentAt)}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {r.lastPaidAt ? (
                        <>
                          {formatCents(r.lastPaidCents ?? 0)} · {fmtDay(r.lastPaidAt)}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-3">
                        <SendLinkCell
                          patientId={r.patientId}
                          disabled={!paymentsReady || !r.hasEmail}
                          disabledReason={
                            !paymentsReady
                              ? 'Connect Stripe first so patients can pay online'
                              : 'This patient has no email on file'
                          }
                        />
                        {canManage &&
                          (onPlan.has(r.patientId) ? (
                            <span className="text-xs text-gray-400" title="This patient already has an open payment plan (see above)">
                              on a plan
                            </span>
                          ) : (
                            <ProposePlanCell
                              patientId={r.patientId}
                              patientName={r.name}
                              balanceCents={r.balanceCents}
                              disabled={!paymentsReady || !r.hasEmail || r.balanceCents < 10_000}
                              disabledReason={
                                !paymentsReady
                                  ? 'Connect Stripe first so the card can be charged'
                                  : !r.hasEmail
                                    ? 'This patient has no email on file'
                                    : 'Plans start at $100 — a single pay link is kinder below that'
                              }
                            />
                          ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-gray-400 border-t border-[color:var(--color-hairline)]">
            Paid amounts stay on this board until your next PMS sync updates the balance — post
            each online payment to the PMS ledger so the books agree.
          </p>
        </div>
      )}
    </div>
  )
}
