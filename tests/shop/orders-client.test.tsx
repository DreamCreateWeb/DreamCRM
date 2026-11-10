import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(default)/shop/actions', () => ({
  setOrderFulfillmentAction: vi.fn(),
}))

import OrdersClient from '@/app/(default)/shop/orders/orders-client'
import { setOrderFulfillmentAction } from '@/app/(default)/shop/actions'
import { ACTION_FAILED_MESSAGE } from '@/lib/deployment-skew'
import type { OrderRow } from '@/lib/types/shop'

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'o1',
    email: 'guest@x.com',
    name: 'Guest Buyer',
    phone: null,
    patientId: null,
    patientName: null,
    fulfillmentType: 'pickup',
    status: 'paid',
    fulfillmentStatus: 'ready_for_pickup',
    subtotalCents: 1000,
    shippingCents: 0,
    taxCents: 0,
    discountCents: 0,
    totalCents: 1000,
    trackingNumber: null,
    trackingUrl: null,
    shippingAddress: null,
    items: [{ productName: 'Whitening Kit', variantName: null, sku: null, unitPriceCents: 1000, quantity: 1 }],
    createdAt: new Date(),
    paidAt: new Date(),
    ageHours: 2,
    refundedAmountCents: 0,
    refundedAt: null,
    ...over,
  }
}

describe('OrdersClient', () => {
  it('links the patient name to the patient detail when patientId is set', () => {
    render(<OrdersClient orders={[order({ patientId: 'pat_9', patientName: 'Mia Hayes' })]} />)
    const link = screen.getByRole('link', { name: /Mia Hayes/ })
    expect(link).toHaveAttribute('href', '/patients/pat_9')
  })

  it('renders the patient name as plain text (no link) when unlinked', () => {
    render(<OrdersClient orders={[order({ patientId: null, patientName: 'Guest Person' })]} />)
    expect(screen.queryByRole('link', { name: /Guest Person/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Guest Person/)).toBeInTheDocument()
  })

  // Regression: the Overview "Fulfill orders" card deep-links to
  // /shop/orders?status=paid. The page parses that into `initialFilter` and
  // passes it here so the list arrives pre-filtered (the param used to be a
  // silent no-op — the page ignored searchParams entirely).
  it('honors initialFilter="paid" so the deep-linked view starts pre-filtered', () => {
    render(
      <OrdersClient
        initialFilter="paid"
        orders={[
          order({ id: 'o1', status: 'paid', patientId: 'p1', patientName: 'Mia Hayes' }),
          order({ id: 'o2', status: 'pending', patientId: 'p2', patientName: 'Liam Brooks' }),
        ]}
      />,
    )
    // Only the paid order is shown on arrival; the pending one is filtered out.
    expect(screen.getByRole('link', { name: /Mia Hayes/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Liam Brooks/ })).not.toBeInTheDocument()
  })

  // Class 6 close (2026-07-20): the Shop hub's "To fulfill" tile deep-links
  // ?fulfillment=unfulfilled → the virtual unfulfilled view (paid AND not
  // yet fulfilled), now a real chip on the board.
  it('honors initialFilter="unfulfilled" (paid + awaiting fulfillment only)', () => {
    render(
      <OrdersClient
        initialFilter="unfulfilled"
        orders={[
          order({ id: 'o1', status: 'paid', fulfillmentStatus: 'unfulfilled', patientId: 'p1', patientName: 'Mia Hayes' }),
          order({ id: 'o2', status: 'paid', fulfillmentStatus: 'shipped', patientId: 'p2', patientName: 'Liam Brooks' }),
          order({ id: 'o3', status: 'pending', fulfillmentStatus: 'unfulfilled', patientId: 'p3', patientName: 'Ava Morgan' }),
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: /Mia Hayes/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Liam Brooks/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ava Morgan/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unfulfilled/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('defaults to showing every order when no initialFilter is passed', () => {
    render(
      <OrdersClient
        orders={[
          order({ id: 'o1', status: 'paid', patientId: 'p1', patientName: 'Mia Hayes' }),
          order({ id: 'o2', status: 'pending', patientId: 'p2', patientName: 'Liam Brooks' }),
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: /Mia Hayes/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Liam Brooks/ })).toBeInTheDocument()
  })

  it('filters orders by patient name / product via the search box', () => {
    render(
      <OrdersClient
        orders={[
          order({ id: 'o1', patientId: 'p1', patientName: 'Mia Hayes', items: [{ productName: 'Whitening Kit', variantName: null, sku: null, unitPriceCents: 1000, quantity: 1 }] }),
          order({ id: 'o2', patientId: 'p2', patientName: 'Liam Brooks', items: [{ productName: 'Water Flosser', variantName: null, sku: null, unitPriceCents: 1000, quantity: 1 }] }),
        ]}
      />,
    )
    // Both visible initially.
    expect(screen.getByRole('link', { name: /Mia Hayes/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Liam Brooks/ })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: /Search orders/i }), { target: { value: 'liam' } })
    expect(screen.queryByRole('link', { name: /Mia Hayes/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Liam Brooks/ })).toBeInTheDocument()

    // Search by product name too.
    fireEvent.change(screen.getByRole('searchbox', { name: /Search orders/i }), { target: { value: 'whitening' } })
    expect(screen.getByRole('link', { name: /Mia Hayes/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Liam Brooks/ })).not.toBeInTheDocument()
  })

  // Graceful action errors: a failed fulfillment update surfaces a toast instead
  // of silently snapping the optimistic status back with no explanation.
  it('shows a toast when a fulfillment update fails', async () => {
    vi.mocked(setOrderFulfillmentAction).mockRejectedValueOnce(new Error('Server said no'))
    render(<OrdersClient orders={[order({ fulfillmentStatus: 'ready_for_pickup' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /Mark picked up/i }))
    // runAction owns the throw now: the person reads the dashboard-wide line.
    expect(await screen.findByText(ACTION_FAILED_MESSAGE)).toBeInTheDocument()
  })

  // ML-42b: shipping asks for tracking in a dialog (never window.prompt), the
  // link must be a valid http(s) URL, and the action carries both.
  describe('the ship dialog', () => {
    const shipOrder = () => order({ fulfillmentType: 'ship', fulfillmentStatus: 'unfulfilled' })
    it('opens a dialog instead of window.prompt and sends number + link', async () => {
      const prompt = vi.fn()
      window.prompt = prompt
      vi.mocked(setOrderFulfillmentAction).mockResolvedValueOnce({ emailed: 'sent' })
      render(<OrdersClient orders={[shipOrder()]} />)
      fireEvent.click(screen.getByRole('button', { name: /Mark shipped/i }))
      const dialog = screen.getByRole('dialog')
      expect(prompt).not.toHaveBeenCalled()
      fireEvent.change(within(dialog).getByLabelText(/Tracking number/), { target: { value: '1Z999' } })
      fireEvent.change(within(dialog).getByLabelText(/Tracking link/), { target: { value: 'https://track.example.com/1Z999' } })
      fireEvent.click(within(dialog).getByRole('button', { name: /Mark shipped/i }))
      await waitFor(() =>
        expect(setOrderFulfillmentAction).toHaveBeenLastCalledWith('o1', 'shipped', '1Z999', 'https://track.example.com/1Z999'),
      )
    })
    it('refuses a link that is not http(s), in words that name the fix', () => {
      vi.mocked(setOrderFulfillmentAction).mockClear()
      render(<OrdersClient orders={[shipOrder()]} />)
      fireEvent.click(screen.getByRole('button', { name: /Mark shipped/i }))
      const dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText(/Tracking link/), { target: { value: 'javascript:alert(1)' } })
      fireEvent.click(within(dialog).getByRole('button', { name: /Mark shipped/i }))
      expect(within(dialog).getByRole('alert').textContent).toMatch(/starting with https:\/\//)
      expect(setOrderFulfillmentAction).not.toHaveBeenCalled()
    })
  })

  // The detail drawer surfaces the per-line pricing, cost breakdown, and
  // shipping address that previously only existed in the CSV export.
  it('opens an order detail drawer with the full breakdown + shipping address', () => {
    render(
      <OrdersClient
        orders={[
          order({
            name: 'Daniel Park',
            fulfillmentType: 'ship',
            status: 'paid',
            fulfillmentStatus: 'shipped',
            subtotalCents: 14800,
            shippingCents: 600,
            totalCents: 15400,
            trackingNumber: '9400110200000000000000',
            shippingAddress: { line1: '500 Cedar St', city: 'Austin', state: 'TX', postal_code: '78704', country: 'US' },
            items: [
              { productName: 'Sonic Brush', variantName: null, sku: null, unitPriceCents: 8900, quantity: 1 },
              { productName: 'Water Flosser', variantName: null, sku: null, unitPriceCents: 5900, quantity: 1 },
            ],
          }),
        ]}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByText('500 Cedar St')).toBeInTheDocument()
    expect(within(drawer).getByText(/Austin, TX 78704/)).toBeInTheDocument()
    expect(within(drawer).getByText('Total')).toBeInTheDocument()
    expect(within(drawer).getByText('$154.00')).toBeInTheDocument()
    expect(within(drawer).getByText(/9400110200000000000000/)).toBeInTheDocument()
  })

  it('closes the order detail drawer on the close button', () => {
    render(<OrdersClient orders={[order()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
