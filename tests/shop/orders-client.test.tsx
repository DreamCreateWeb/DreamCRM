import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(default)/shop/actions', () => ({
  setOrderFulfillmentAction: vi.fn(),
}))

import OrdersClient from '@/app/(default)/shop/orders/orders-client'
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
    shippingAddress: null,
    items: [{ productName: 'Whitening Kit', variantName: null, sku: null, unitPriceCents: 1000, quantity: 1 }],
    createdAt: new Date(),
    paidAt: new Date(),
    ageHours: 2,
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
})
