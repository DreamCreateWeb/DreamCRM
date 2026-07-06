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
} from '@/components/patient-portal/ui'
import { fmtMoney, fmtVisitDayShort } from '@/components/patient-portal/format'
import PayBalanceForm from './pay-form'
import PlanOffer, { type PlanOption } from './plan-offer'
import BillingHistory, { type BillingHistoryRow } from './billing-history'
import { listActivePlans } from '@/lib/services/membership'
import {
  getMyOpenPaymentPlan,
  planInstallmentCents,
  planAmountForInstallment,
  PLAN_MIN_TOTAL_CENTS,
  PLAN_MIN_INSTALLMENT_CENTS,
  PLAN_MIN_MONTHS,
  PLAN_MAX_MONTHS,
} from '@/lib/services/payment-plans'

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

  const [bills, payments, paymentsAvailable, openPlan, activePlans] = await Promise.all([
    getMyBills(ctx.patientId, ctx.organizationId),
    getMyBalancePayments(ctx.patientId, ctx.organizationId),
    settings.features.payments ? canTakeBalancePayments(ctx.organizationId) : Promise.resolve(false),
    // Any open plan (proposed / active / past_due) — shown as a status card;
    // its existence also hides the split-it offer (one plan at a time).
    getMyOpenPaymentPlan(ctx.organizationId, ctx.patientId).catch(() => null),
    // Membership upsell — only worth loading when the patient has no plan.
    listActivePlans(ctx.organizationId).catch(() => []),
  ])

  const hasBalance = bills.pmsBalanceCents != null && bills.pmsBalanceCents > 0

  // Month options for the split-it offer, floors applied server-side so the
  // client never shows a cadence the propose call would reject.
  const planOptions: PlanOption[] = []
  if (
    hasBalance &&
    !openPlan &&
    settings.features.payments &&
    paymentsAvailable &&
    bills.pmsBalanceCents! >= PLAN_MIN_TOTAL_CENTS
  ) {
    for (let m = PLAN_MIN_MONTHS; m <= PLAN_MAX_MONTHS; m++) {
      const per = planInstallmentCents(bills.pmsBalanceCents!, m)
      if (per < PLAN_MIN_INSTALLMENT_CENTS) break
      planOptions.push({
        months: m,
        perCents: per,
        lastCents: planAmountForInstallment(bills.pmsBalanceCents!, m, m - 1),
      })
    }
  }
  const justPaid = Boolean(sessionId)

  // One chronological money trail: balance payments + shop orders. Each row
  // links to its printable receipt (key doubles as the receipt slug).
  const history: BillingHistoryRow[] = [
    ...payments.map((p): BillingHistoryRow => ({
      key: `pay-${p.id}`,
      kind: 'payment',
      whenIso: (p.paidAt ?? p.createdAt).toISOString(),
      label: 'Balance payment',
      detail: p.status === 'paid' ? 'Paid online' : 'Processing',
      amountCents: p.amountCents,
      badge: p.status === 'paid' ? null : 'Processing',
    })),
    ...bills.orders.map((o): BillingHistoryRow => ({
      key: `order-${o.id}`,
      kind: 'order',
      whenIso: (o.paidAt ?? o.createdAt).toISOString(),
      label: o.items.map((i) => `${i.productName}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ') || 'Shop order',
      detail: FULFILLMENT_LABELS[o.fulfillmentStatus] ?? null,
      amountCents: o.totalCents,
      badge: o.status === 'pending' ? 'Processing' : null,
    })),
  ].sort((a, b) => new Date(b.whenIso).getTime() - new Date(a.whenIso).getTime())

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
                <>
                  <PayBalanceForm balanceCents={bills.pmsBalanceCents!} brand={brand} />
                  <PlanOffer options={planOptions} brand={brand} />
                </>
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

      {/* Open payment plan — honest live status; a proposed plan links back
          into the accept flow so an interrupted setup is one tap to finish. */}
      {openPlan && (
        <section className="mt-7">
          <PortalSectionLabel>Your payment plan</PortalSectionLabel>
          <PortalCard accent={brand}>
            {openPlan.status === 'proposed' ? (
              <>
                <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
                  {fmtMoney(openPlan.totalCents)} over {openPlan.installments} monthly payments
                </p>
                <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
                  About {fmtMoney(openPlan.installmentCents)} a month. It isn’t active yet — finish
                  the two-minute setup to save a card, and the first payment happens then.
                </p>
                <a
                  href={`/i/${openPlan.token}`}
                  className="mt-3 inline-flex items-center rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
                  style={{ backgroundColor: brand }}
                >
                  Finish setting up →
                </a>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
                    {openPlan.installmentsPaid} of {openPlan.installments} payments made
                  </p>
                  {openPlan.status === 'past_due' && (
                    <span
                      className="rounded-full px-2.5 py-1 text-[0.72rem] font-semibold"
                      style={{ backgroundColor: '#FBEAE9', color: '#B4231F' }}
                    >
                      Payment needs attention
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
                  {fmtMoney(openPlan.installmentCents)} a month, charged automatically
                  {openPlan.nextChargeAt
                    ? ` — next one ${fmtVisitDayShort(openPlan.nextChargeAt, timeZone)}`
                    : ''}
                  .{' '}
                  {openPlan.status === 'past_due'
                    ? 'The last charge didn’t go through — we’ll retry, or call us and we’ll sort it out together.'
                    : 'Questions or need to adjust it? Just message us.'}
                </p>
              </>
            )}
          </PortalCard>
        </section>
      )}

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
            {settings.features.messages && (
              <p className="mt-2 text-[0.82rem]" style={{ color: PORTAL_MUTED }}>
                Need to change or pause it?{' '}
                <a href="/patient/messages" className="font-semibold" style={{ color: brand }}>
                  Message us
                </a>{' '}
                — we’ll handle it, no hoops.
              </p>
            )}
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

      {/* Membership upsell — only for patients WITHOUT a plan, and only when
          the clinic actually sells one. Links into the public dental-plans
          page, which carries the full pitch + checkout. */}
      {!bills.membership && activePlans.length > 0 && (
        <section className="mt-7">
          <PortalSectionLabel>Worth a look</PortalSectionLabel>
          <PortalCard>
            <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
              No dental insurance? There’s a plan for that.
            </p>
            <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
              Our in-house plan covers your routine care and discounts the rest — from{' '}
              {fmtMoney(Math.min(...activePlans.map((pl) => pl.priceCents)))}/
              {activePlans.find((pl) => pl.priceCents === Math.min(...activePlans.map((x) => x.priceCents)))?.billingInterval === 'annual' ? 'year' : 'month'}
              . No deductibles, no claim forms, no waiting periods.
            </p>
            <a
              href={`/site/${ctx.organizationSlug}/dental-plans`}
              className="mt-3 inline-flex items-center rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              See the plans →
            </a>
          </PortalCard>
        </section>
      )}

      <section className="mt-7">
        <PortalSectionLabel>History</PortalSectionLabel>
        <BillingHistory rows={history} brand={brand} timeZone={timeZone} />
      </section>
    </div>
  )
}
