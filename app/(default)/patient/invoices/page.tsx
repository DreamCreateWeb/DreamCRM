export const metadata = {
  title: 'Bills - DreamCRM',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getMyBills, getMyClinicHeader, type BillsOrder, type BillsMembership } from '@/lib/services/patient-portal'

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const ORDER_STATUS_PILL: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  refunded: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
}

const FULFILLMENT_LABEL: Record<string, string> = {
  unfulfilled: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  picked_up: 'Picked up',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

export default async function PatientBills() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/')

  const [bills, clinic] = await Promise.all([
    getMyBills(ctx.patientId, ctx.organizationId),
    getMyClinicHeader(ctx.organizationId),
  ])

  const hasAnything =
    bills.pmsBalanceCents !== null || bills.membership !== null || bills.orders.length > 0

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Bills</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Outstanding balance, membership, and order history from {ctx.organizationName}.
        </p>
      </div>

      {!hasAnything ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">📄</p>
          <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
            Nothing on file
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You don&apos;t have any outstanding bills, memberships, or orders right now.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {bills.pmsBalanceCents !== null && bills.pmsBalanceCents > 0 && (
            <DentalBalanceCard
              balanceCents={bills.pmsBalanceCents}
              updatedAt={bills.pmsBalanceUpdatedAt}
              clinicPhone={clinic?.phone ?? null}
              clinicEmail={clinic?.email ?? null}
            />
          )}

          {bills.membership && <MembershipCard membership={bills.membership} />}

          {bills.orders.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Order history</h2>
              <ul className="space-y-3">
                {bills.orders.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function DentalBalanceCard({
  balanceCents,
  updatedAt,
  clinicPhone,
  clinicEmail,
}: {
  balanceCents: number
  updatedAt: Date | null
  clinicPhone: string | null
  clinicEmail: string | null
}) {
  return (
    <section className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
        Outstanding dental balance
      </p>
      <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">
        {money(balanceCents)}
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
        This balance comes from your dental chart. To pay or ask about it,
        {clinicPhone && <> call <a href={`tel:${clinicPhone}`} className="font-medium text-amber-700 dark:text-amber-300 hover:underline">{clinicPhone}</a></>}
        {clinicPhone && clinicEmail && <> or</>}
        {clinicEmail && <> email <a href={`mailto:${clinicEmail}`} className="font-medium text-amber-700 dark:text-amber-300 hover:underline">{clinicEmail}</a></>}
        {!clinicPhone && !clinicEmail && <> contact the clinic directly</>}.
      </p>
      {updatedAt && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
          Last updated {fmtDate(updatedAt)}
        </p>
      )}
    </section>
  )
}

function MembershipCard({ membership }: { membership: BillsMembership }) {
  const periodLabel = membership.planBillingInterval === 'monthly' ? '/mo' : '/yr'
  const statusPill: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    past_due: 'bg-red-500/15 text-red-700 dark:text-red-300',
  }
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Membership
          </p>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{membership.planName}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {money(membership.priceCents)}{periodLabel}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${statusPill[membership.status] ?? statusPill.pending}`}
        >
          {membership.status.replace('_', ' ')}
        </span>
      </div>
      {membership.benefits.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {membership.benefits.map((b, i) => {
            const used = membership.benefitsUsed[b.label] ?? 0
            const remaining = b.qty !== undefined ? Math.max(0, b.qty - used) : null
            return (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <span className="flex-1">
                  {b.label}
                  {remaining !== null && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      {remaining} of {b.qty} remaining
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {membership.currentPeriodEnd && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          {membership.status === 'active' ? 'Renews' : 'Period ends'} {fmtDate(membership.currentPeriodEnd)}
        </p>
      )}
    </section>
  )
}

function OrderRow({ order }: { order: BillsOrder }) {
  return (
    <li className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {order.items.length > 0
              ? order.items.map((it) => it.productName).join(', ')
              : 'Order'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {fmtDate(order.createdAt)}
            {order.status === 'paid' && order.fulfillmentType === 'ship' && (
              <> · Ship</>
            )}
            {order.status === 'paid' && order.fulfillmentType === 'pickup' && (
              <> · Pickup</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {money(order.totalCents)}
          </span>
          <span
            className={`text-[10px] font-medium px-2 py-1 rounded-full capitalize ${ORDER_STATUS_PILL[order.status] ?? ORDER_STATUS_PILL.pending}`}
          >
            {order.status}
          </span>
        </div>
      </div>

      {order.items.length > 0 && (
        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5 mt-2 pl-3 border-l border-gray-100 dark:border-gray-700/60">
          {order.items.map((it, i) => (
            <li key={i}>
              {it.quantity}× {it.productName}
              {it.variantName && <span className="text-gray-500 dark:text-gray-400"> · {it.variantName}</span>}
              <span className="text-gray-500 dark:text-gray-400 ml-2">{money(it.unitPriceCents * it.quantity)}</span>
            </li>
          ))}
        </ul>
      )}

      {order.status === 'paid' && (
        <div className="mt-3 flex items-center gap-3 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            {FULFILLMENT_LABEL[order.fulfillmentStatus] ?? order.fulfillmentStatus}
          </span>
          {order.trackingNumber && order.fulfillmentType === 'ship' && (
            <span className="text-gray-700 dark:text-gray-200">
              Tracking: <span className="font-mono">{order.trackingNumber}</span>
            </span>
          )}
        </div>
      )}
    </li>
  )
}
