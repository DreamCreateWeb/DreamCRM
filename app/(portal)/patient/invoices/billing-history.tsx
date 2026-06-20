'use client'

import { useState } from 'react'
import { fmtMoney, fmtVisitDayShort } from '@/components/patient-portal/format'
import { PortalCard, PORTAL_INK, PORTAL_MUTED, PORTAL_BORDER } from '@/components/patient-portal/ui'

/**
 * Billing history list: the merged money trail (online balance payments + shop
 * orders), now with filter tabs (All / Payments / Purchases) and every row a
 * link to its printable receipt — the "where's my receipt?" fix. The receipt
 * route re-derives the single transaction from the same patient-scoped reads.
 */

export interface BillingHistoryRow {
  /** Doubles as the receipt slug: `pay-<id>` | `order-<id>`. */
  key: string
  kind: 'payment' | 'order'
  whenIso: string
  label: string
  detail: string | null
  amountCents: number
  badge: string | null
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'payment', label: 'Payments' },
  { id: 'order', label: 'Purchases' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function BillingHistory({
  rows,
  brand,
  timeZone,
}: {
  rows: BillingHistoryRow[]
  brand: string
  timeZone: string
}) {
  const [tab, setTab] = useState<TabId>('all')

  if (rows.length === 0) {
    return (
      <PortalCard>
        <p className="py-4 text-center text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
          No payments or purchases yet — when there are, they’ll live here.
        </p>
      </PortalCard>
    )
  }

  const hasPayments = rows.some((r) => r.kind === 'payment')
  const hasOrders = rows.some((r) => r.kind === 'order')
  const showTabs = hasPayments && hasOrders
  const visible = tab === 'all' ? rows : rows.filter((r) => r.kind === tab)

  return (
    <div>
      {showTabs && (
        <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Filter history">
          {TABS.map((t) => {
            const on = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className="rounded-full px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors"
                style={
                  on
                    ? { backgroundColor: brand, color: '#FFFFFF' }
                    : { backgroundColor: '#FFFFFF', color: PORTAL_MUTED, border: `1px solid ${PORTAL_BORDER}` }
                }
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
        <ul>
          {visible.map((h, i) => (
            <li key={h.key} style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}>
              <a
                href={`/patient/invoices/${h.key}`}
                className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-[#FAF7F2]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.92rem] font-semibold" style={{ color: PORTAL_INK }}>
                    {h.label}
                  </p>
                  <p className="text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                    {fmtVisitDayShort(new Date(h.whenIso), timeZone)}
                    {h.detail ? ` · ${h.detail}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {h.badge && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
                      style={{ backgroundColor: '#FBF3E4', color: '#8A6116' }}
                    >
                      {h.badge}
                    </span>
                  )}
                  <span className="text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
                    {fmtMoney(h.amountCents)}
                  </span>
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke={PORTAL_MUTED}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 3.5 10.5 8 6 12.5" />
                  </svg>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2.5 text-center text-[0.78rem]" style={{ color: PORTAL_MUTED }}>
        Tap any line for a printable receipt.
      </p>
    </div>
  )
}
