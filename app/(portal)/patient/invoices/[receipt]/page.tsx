export const metadata = {
  title: 'Receipt — Patient portal',
}

export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getMyBills, getMyBalancePayments } from '@/lib/services/patient-portal'
import { getPortalPageContext, requirePortalFeature } from '../../portal-data'
import { PORTAL_INK, PORTAL_MUTED, PORTAL_BORDER, PortalBackLink } from '@/components/patient-portal/ui'
import { fmtMoney, fmtVisitDayShort } from '@/components/patient-portal/format'
import PrintReceiptButton from './print-button'

const FULFILLMENT_LABELS: Record<string, string> = {
  unfulfilled: 'Being prepared',
  ready_for_pickup: 'Ready for pickup',
  picked_up: 'Picked up',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

interface ReceiptLine {
  label: string
  sub: string | null
  amountCents: number
}

export default async function PortalReceiptPage({
  params,
}: {
  params: Promise<{ receipt: string }>
}) {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'billing')
  const { ctx, clinic, brand, timeZone } = pc
  const { receipt } = await params

  // Re-derive the single transaction from the same patient-scoped reads the
  // billing list uses — so a patient can only ever pull their own receipt.
  let title = 'Receipt'
  let when: Date = new Date()
  let status: string | null = null
  let lines: ReceiptLine[] = []
  let totalCents = 0
  let footNote: string | null = null

  if (receipt.startsWith('order-')) {
    const bills = await getMyBills(ctx.patientId, ctx.organizationId)
    const order = bills.orders.find((o) => o.id === receipt.slice('order-'.length))
    if (!order) notFound()
    title = 'Order receipt'
    when = order.paidAt ?? order.createdAt
    status = order.status === 'pending' ? 'Processing' : 'Paid'
    lines = order.items.map((it) => ({
      label: `${it.productName}${it.variantName ? ` — ${it.variantName}` : ''}`,
      sub: it.quantity > 1 ? `${fmtMoney(it.unitPriceCents)} each × ${it.quantity}` : null,
      amountCents: it.unitPriceCents * it.quantity,
    }))
    const itemsSubtotal = lines.reduce((s, l) => s + l.amountCents, 0)
    totalCents = order.totalCents
    // Anything beyond the line items is shipping + tax — name it honestly
    // rather than letting the totals look off.
    if (totalCents > itemsSubtotal) {
      lines.push({ label: 'Shipping & tax', sub: null, amountCents: totalCents - itemsSubtotal })
    }
    const fulfillment = FULFILLMENT_LABELS[order.fulfillmentStatus]
    footNote = [
      fulfillment ? `Fulfillment: ${fulfillment}` : null,
      order.trackingNumber ? `Tracking: ${order.trackingNumber}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null
  } else if (receipt.startsWith('pay-')) {
    const payments = await getMyBalancePayments(ctx.patientId, ctx.organizationId)
    const pay = payments.find((p) => p.id === receipt.slice('pay-'.length))
    if (!pay) notFound()
    title = 'Payment receipt'
    when = pay.paidAt ?? pay.createdAt
    status = pay.status === 'paid' ? 'Paid' : 'Processing'
    lines = [{ label: 'Balance payment', sub: 'Paid online toward your account balance', amountCents: pay.amountCents }]
    totalCents = pay.amountCents
    footNote = 'The front desk posts online payments to your account in their practice system.'
  } else {
    notFound()
  }

  const ref = `#${receipt.replace(/^(order|pay)-/, '').slice(-8).toUpperCase()}`
  const addr = clinic
    ? [clinic.addressLine1, [clinic.city, clinic.state, clinic.postalCode].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div className="mx-auto max-w-xl">
      {/* Print-isolation: only the receipt sheet ends up on paper — the portal
          chrome, the back link, and the print button are hidden. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #receipt, #receipt * { visibility: visible !important; }
        #receipt { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
      }`}</style>

      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <PortalBackLink href="/patient/invoices" label="Billing" brand={brand} />
        <PrintReceiptButton brand={brand} />
      </div>

      <div
        id="receipt"
        className="rounded-2xl bg-white p-6 sm:p-8"
        style={{ border: `1px solid ${PORTAL_BORDER}` }}
      >
        {/* Letterhead */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[1.15rem] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)', color: PORTAL_INK }}>
              {clinic?.displayName ?? 'Your clinic'}
            </p>
            {addr && (
              <p className="mt-0.5 text-[0.85rem]" style={{ color: PORTAL_MUTED }}>
                {addr}
              </p>
            )}
            {clinic?.phone && (
              <p className="text-[0.85rem]" style={{ color: PORTAL_MUTED }}>
                {clinic.phone}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[0.85rem] font-semibold uppercase tracking-wider" style={{ color: brand }}>
              {title}
            </p>
            <p className="text-[0.85rem] tabular-nums" style={{ color: PORTAL_MUTED }}>
              {ref}
            </p>
          </div>
        </div>

        <div className="my-5 h-px w-full" style={{ backgroundColor: PORTAL_BORDER }} />

        {/* Meta */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.82rem]">
          <span style={{ color: PORTAL_MUTED }}>
            Billed to <span className="font-semibold" style={{ color: PORTAL_INK }}>{ctx.userName}</span>
          </span>
          <span style={{ color: PORTAL_MUTED }}>
            {fmtVisitDayShort(when, timeZone)}
            {status ? ` · ${status}` : ''}
          </span>
        </div>

        {/* Line items */}
        <ul className="mt-4">
          {lines.map((l, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-4 py-2.5"
              style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}
            >
              <div className="min-w-0">
                <p className="text-[0.9rem] font-medium" style={{ color: PORTAL_INK }}>{l.label}</p>
                {l.sub && <p className="text-[0.82rem]" style={{ color: PORTAL_MUTED }}>{l.sub}</p>}
              </div>
              <span className="shrink-0 text-[0.9rem] font-semibold tabular-nums" style={{ color: PORTAL_INK }}>
                {fmtMoney(l.amountCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-baseline justify-between border-t-2 pt-3" style={{ borderColor: PORTAL_BORDER }}>
          <span className="text-[0.82rem] font-semibold uppercase tracking-wider" style={{ color: PORTAL_MUTED }}>
            Total
          </span>
          <span className="text-[1.4rem] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: PORTAL_INK }}>
            {fmtMoney(totalCents)}
          </span>
        </div>

        {footNote && (
          <p className="mt-4 text-[0.85rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
            {footNote}
          </p>
        )}

        <p className="mt-5 text-center text-[0.82rem]" style={{ color: PORTAL_MUTED }}>
          Thank you{clinic?.phone ? ` — questions about this receipt? Call ${clinic.phone}.` : '.'}
        </p>
      </div>
    </div>
  )
}
