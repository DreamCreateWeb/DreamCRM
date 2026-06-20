import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BillingHistory, {
  type BillingHistoryRow,
} from '@/app/(portal)/patient/invoices/billing-history'

/**
 * The billing history now filters and links to printable receipts. These pin
 * the two behaviors a patient relies on: every line is a receipt link (key =
 * the receipt slug the [receipt] route re-derives), and the All/Payments/
 * Purchases tabs only appear when both kinds are present (no lonely filter).
 */

const rows: BillingHistoryRow[] = [
  { key: 'pay-p1', kind: 'payment', whenIso: '2026-05-02T10:00:00Z', label: 'Balance payment', detail: 'Paid online', amountCents: 5000, badge: null },
  { key: 'order-o1', kind: 'order', whenIso: '2026-05-01T10:00:00Z', label: 'Whitening kit', detail: 'Shipped', amountCents: 3200, badge: null },
  { key: 'order-o2', kind: 'order', whenIso: '2026-04-20T10:00:00Z', label: 'Brush heads', detail: null, amountCents: 1800, badge: 'Processing' },
]

const base = { brand: '#0a7d72', timeZone: 'America/New_York' }

describe('BillingHistory', () => {
  it('shows the empty state when there are no rows', () => {
    render(<BillingHistory rows={[]} {...base} />)
    expect(screen.getByText(/No payments or purchases yet/i)).toBeTruthy()
  })

  it('links every row to its printable receipt (key doubles as the slug)', () => {
    render(<BillingHistory rows={rows} {...base} />)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/patient/invoices/pay-p1')
    expect(hrefs).toContain('/patient/invoices/order-o1')
    expect(hrefs).toContain('/patient/invoices/order-o2')
  })

  it('filters to Payments / Purchases when both kinds are present', () => {
    render(<BillingHistory rows={rows} {...base} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Payments' }))
    expect(screen.getByText('Balance payment')).toBeTruthy()
    expect(screen.queryByText('Whitening kit')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Purchases' }))
    expect(screen.getByText('Whitening kit')).toBeTruthy()
    expect(screen.queryByText('Balance payment')).toBeNull()
  })

  it('hides the filter tabs when only one kind exists', () => {
    render(<BillingHistory rows={rows.filter((r) => r.kind === 'order')} {...base} />)
    expect(screen.queryByRole('tab', { name: 'Payments' })).toBeNull()
    expect(screen.getByText('Whitening kit')).toBeTruthy()
  })
})
