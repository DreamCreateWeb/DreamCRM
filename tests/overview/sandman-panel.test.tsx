import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SandmanPanel from '@/app/(default)/dream-team/sandman-panel'

const { mockAsk } = vi.hoisted(() => ({
  mockAsk: vi.fn(async (..._a: unknown[]) => ({
    ok: true,
    answer: 'Nine seated so far, against seventeen at this point last month.',
    actions: [{ kind: 'open_outreach', label: 'Open recall & outreach', href: '/growth/outreach' }],
  })),
}))
vi.mock('@/app/(default)/dream-team/actions', () => ({ askSandmanAction: mockAsk }))

beforeEach(() => mockAsk.mockClear())

describe('the Sandman panel', () => {
  it('opens with the questions a front desk actually has — and promises the privacy line', () => {
    render(<SandmanPanel clinicName="Acme Dental" />)
    expect(screen.getByText('Ask Sandman')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How are we doing on new patients this month?' })).toBeInTheDocument()
    expect(screen.getByText(/never an individual patient/i)).toBeInTheDocument()
  })

  it('a tapped suggestion asks it, and the answer renders with its suggested place to look', async () => {
    render(<SandmanPanel clinicName="Acme Dental" />)
    fireEvent.click(screen.getByRole('button', { name: 'Why are we seeing fewer patients than last month?' }))
    await waitFor(() =>
      expect(mockAsk).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'Why are we seeing fewer patients than last month?' }),
      ),
    )
    expect(await screen.findByText(/Nine seated so far/)).toBeInTheDocument()
    // The suggestion is a LINK, never a button that acts.
    const link = screen.getByRole('link', { name: /Open recall & outreach/ })
    expect(link).toHaveAttribute('href', '/growth/outreach')
  })

  it('sends the prior turns as history so a follow-up question keeps its thread', async () => {
    render(<SandmanPanel clinicName="Acme Dental" />)
    const input = screen.getByLabelText('Ask Sandman about your practice')
    fireEvent.change(input, { target: { value: 'how is the month?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(screen.getByText(/Nine seated so far/)).toBeInTheDocument())

    fireEvent.change(input, { target: { value: 'why?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(mockAsk).toHaveBeenCalledTimes(2))
    const second = mockAsk.mock.calls[1][0] as { query: string; history: Array<{ role: string }> }
    expect(second.query).toBe('why?')
    expect(second.history).toHaveLength(2)
    expect(second.history[0].role).toBe('user')
    expect(second.history[1].role).toBe('assistant')
  })

  it('a failed ask answers honestly in the thread instead of throwing the panel away', async () => {
    mockAsk.mockRejectedValueOnce(new Error('network'))
    render(<SandmanPanel clinicName="Acme Dental" />)
    fireEvent.click(screen.getByRole('button', { name: 'Is anything waiting on me?' }))
    expect(await screen.findByText(/didn’t go through/)).toBeInTheDocument()
  })
})
