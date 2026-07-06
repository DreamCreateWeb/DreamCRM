import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const startMock = vi.fn()
vi.mock('@/app/(portal)/patient/actions', () => ({
  startMyPaymentPlanAction: (m: number) => startMock(m),
}))

import PlanOffer from '@/app/(portal)/patient/invoices/plan-offer'

const OPTIONS = [
  { months: 2, perCents: 15000, lastCents: 15000 },
  { months: 3, perCents: 10000, lastCents: 10000 },
  { months: 4, perCents: 7500, lastCents: 7501 },
]

beforeEach(() => startMock.mockReset())

describe('PlanOffer', () => {
  it('renders nothing with no options (floors filtered everything out)', () => {
    const { container } = render(<PlanOffer options={[]} brand="#2F6D62" />)
    expect(container.innerHTML).toBe('')
  })

  it('starts collapsed; opening shows the month chips with $/mo amounts', () => {
    render(<PlanOffer options={OPTIONS} brand="#2F6D62" />)
    fireEvent.click(screen.getByRole('button', { name: /split it into monthly payments/i }))
    expect(screen.getByRole('button', { name: /2 months · \$150\.00\/mo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /4 months · \$75\.00\/mo/ })).toBeInTheDocument()
  })

  it('confirm is disabled until a cadence is picked; uneven last payment is disclosed', () => {
    render(<PlanOffer options={OPTIONS} brand="#2F6D62" />)
    fireEvent.click(screen.getByRole('button', { name: /split it into monthly payments/i }))
    const confirm = screen.getByRole('button', { name: /Review my plan/i })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /4 months/ }))
    expect(confirm).not.toBeDisabled()
    expect(screen.getByText(/last payment is \$75\.01/i)).toBeInTheDocument()
  })

  it('confirming calls the action with the chosen months and shows a server error', async () => {
    startMock.mockResolvedValueOnce({ ok: false, error: 'This patient already has an open payment plan — cancel it first to start over.' })
    render(<PlanOffer options={OPTIONS} brand="#2F6D62" />)
    fireEvent.click(screen.getByRole('button', { name: /split it into monthly payments/i }))
    fireEvent.click(screen.getByRole('button', { name: /3 months/ }))
    fireEvent.click(screen.getByRole('button', { name: /Review my plan/i }))
    await waitFor(() => expect(startMock).toHaveBeenCalledWith(3))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already has an open payment plan/i)
  })
})
