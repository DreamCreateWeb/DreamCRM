export const metadata = {
  title: 'Billing — Patient portal',
}

export const dynamic = 'force-dynamic'

import { getMyBills, getMyBalancePayments } from '@/lib/services/patient-portal'
import {
  canTakeBalancePayments,
  finalizeBalancePaymentFromSession,
} from '@/lib/services/balance-payments'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
} from '@/components/patient-portal/ui'
import { fmtMoney, fmtVisitDayShort } from '@/components/patient-portal/format'
import PayBalanceForm from './pay-form'

const FULFILLMENT_LABELS: Record<string, string> = {
  unfulfilled: 'Being prepared',
  ready_for_pickup: 'Ready for pickup',
  picked_up: 'Picked up',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

export default async function PortalBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'billing')
  const { ctx, settings, clinic, brand, timeZone } = pc

  // Returning from Stripe — finalize idempotently (webhook is the backstop).
  const { session_id: sessionId } = await searchParams
  if (sessionId) {
    await finalizeBalancePaymentFromSession(ctx.organizationId, sessionId).catch(() => {})
  }

  const [bills, payments, paymentsAvailable] = await Promise.all([
    getMyBills(ctx.patientId, ctx.organizationId),
    getMyBalancePayments(ctx.patientId, ctx.organizationId),
    settings.features.payments ? canTakeBalancePayments(ctx.organizationId) : Promise.resolve(false),
  ])

  const hasBalance = bills.pmsBalanceCents != null && bills.pmsBalanceCents > 0
  const justPaid = Boolean(sessionId)

  // One chronological money trail: balance payments + shop orders.
  const history: Array<{
    key: string
    when: Date
    label: string
    detail: string | null
    amountCents: number
    badge: string | null
  }> = [
    ...payments.map((p) => ({
      key: `pay-${p.id}`,
      when: p.paidAt ?? p.createdAt,
      label: 'Balance payment',
      detail: p.status === 'paid' ? 'Paid online' : 'Processing',
      amountCents: p.amountCents,
      badge: p.status === 'paid' ? null : 'Processing',
    })),
    ...bills.orders.map((o) => ({
      key: `order-${o.id}`,
      when: o.paidAt ?? o.createdAt,
      label: o.items.map((i) => `${i.productName}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ') || 'Shop order',
      detail: FULFILLMENT_LABELS[o.fulfillmentStatus] ?? null,
      amountCents: o.totalCents,
      badge: o.status === 'pending' ? 'Processing' : null,
    })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime())

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>Billing</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        No surprises — what you owe, what you’ve paid, and where it stands.
      </p>

      {justPaid && (
        <div className="mt-5 rounded-2xl px-4 py-3.5 text-[0.9rem] font-medium" style={{ backgroundColor: '#E5EFE6', color: '#2F6B3C' }}>
          Thank you — your payment went through. The front desk will post it to your account, so the
          balance below may take a little while to update.
        </div>
      )}

      <section className="mt-6">
        <PortalSectionLabel>Your balance</PortalSectionLabel>
        <PortalCard accent={hasBalance ? brand : undefined}>
          {hasBalance ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[2rem] font-semibold leading-none" style={{ fontFamily: 'var(--font-display)', color: PORTAL_INK }}>
                  {fmtMoney(bills.pmsBalanceCents!)}
                </p>
                {bills.pmsBalanceUpdatedAt && (
                  <p className="text-[0.78rem]" style={{ color: PORTAL_MUTED }}>
                    as of {fmtVisitDayShort(bills.pmsBalanceUpdatedAt, timeZone)}
                  </p>
                )}
              </div>
              <p className="mt-2 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
                This comes straight from our practice system. If something looks off, ask — we’ll
                walk through it line by line, in plain language.
              </p>
              {settings.features.payments && paymentsAvailable ? (
                <PayBalanceForm balanceCents={bills.pmsBalanceCents!} brand={brand} />
              ) : (
                clinic?.phone && (
                  <p className="mt-3 text-[0.88rem]" style={{ color: PORTAL_MUTED }}>
                    To pay, call us at{' '}
                    <a href={`tel:${clinic.phone}`} className="font-semibold" style={{ color: brand }}>
                      {clinic.phone}
                    </a>{' '}
                    or stop by the front desk — whatever’s easiest.
                  </p>
                )
              )}
            </>
          ) : bills.pmsBalanceCents != null ? (
            <>
              <p className="text-[1.1rem] font-semibold" style={{ color: PORTAL_INK }}>
                You’re all paid up
              </p>
              <p className="mt-1 text-[0.88rem]" style={{ color: PORTAL_MUTED }}>
                Nothing owed right now. We’ll let you know if that changes.
              </p>
            </>
          ) : (
            <>
              <p className="text-[1.1rem] font-semibold" style={{ color: PORTAL_INK }}>
                Balance questions? Just ask.
              </p>
              <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
                Your balance lives in our practice system. Call{clinic?.phone ? ' ' : ' us'}
                {clinic?.phone && (
                  <a href={`tel:${clinic.phone}`} className="font-semibold" style={{ color: brand }}>
                    {clinic.phone}
                  </a>
                )}{' '}
                or send a message and we’ll get you the up-to-date number.
              </p>
            </>
          )}
        </PortalCard>
      </section>

      {bills.membership && (
        <section className="mt-7">
          <PortalSectionLabel>Your plan</PortalSectionLabel>
          <PortalCard>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
                {bills.membership.planName}
              </p>
              <span
                className="rounded-full px-2.5 py-1 text-[0.72rem] font-semibold"
                style={
                  bills.membership.status === 'active'
                    ? { backgroundColor: '#E5EFE6', color: '#2F6B3C' }
                    : { backgroundColor: '#FBF3E4', color: '#8A6116' }
                }
              >
                {bills.membership.status === 'active'
                  ? 'Active'
                  : bills.membership.status === 'past_due'
                    ? 'Payment needs attention'
                    : bills.membership.status}
              </span>
            </div>
            <p className="mt-1 text-[0.85rem]" style={{ color: PORTAL_MUTED }}>
              {fmtMoney(bills.membership.priceCents)} / {bills.membership.planBillingInterval === 'annual' ? 'year' : 'month'}
              {bills.membership.currentPeriodEnd &&
                ` · renews ${fmtVisitDayShort(bills.membership.currentPeriodEnd, timeZone)}`}
            </p>
            {bills.membership.benefits.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {bills.membership.benefits.map((b, i) => {
                  const used = bills.membership!.benefitsUsed[b.label] ?? 0
                  return (
                    <li key={i} className="flex items-center justify-between text-[0.88rem]">
                      <span style={{ color: PORTAL_INK }}>{b.label}</span>
                      {b.qty != null && (
                        <span style={{ color: PORTAL_MUTED }}>
                          {used} of {b.qty} used
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </PortalCard>
        </section>
      )}

      <section className="mt-7">
        <PortalSectionLabel>History</PortalSectionLabel>
        {history.length === 0 ? (
          <PortalCard>
            <p className="py-4 text-center text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
              No payments or purchases yet — when there are, they’ll live here.
            </p>
          </PortalCard>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
            <ul>
              {history.map((h, i) => (
                <li
                  key={h.key}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                  style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.92rem] font-semibold" style={{ color: PORTAL_INK }}>
                      {h.label}
                    </p>
                    <p className="text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                      {fmtVisitDayShort(h.when, timeZone)}
                      {h.detail ? ` · ${h.detail}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {h.badge && (
                      <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ backgroundColor: '#FBF3E4', color: '#8A6116' }}>
                        {h.badge}
                      </span>
                    )}
                    <span className="text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
                      {fmtMoney(h.amountCents)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
