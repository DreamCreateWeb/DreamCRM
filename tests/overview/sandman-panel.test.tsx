import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SandmanPanel from '@/app/(default)/dream-team/sandman-panel'

const { mockAsk, mockPutToWork } = vi.hoisted(() => ({
  mockAsk: vi.fn(async (..._a: unknown[]) => ({
    ok: true,
    answer: 'Nine seated so far, against seventeen at this point last month.',
    actions: [{ kind: 'open_outreach', label: 'Open recall & outreach', href: '/growth/outreach' }],
    requests: [] as Array<{ kind: string; label: string }>,
  })),
  mockPutToWork: vi.fn(async (..._a: unknown[]) => ({
    ok: true,
    message: 'Done — a post is drafted and waiting on your yes.',
  })),
}))
vi.mock('@/app/(default)/dream-team/actions', () => ({
  askSandmanAction: mockAsk,
  askTeamForWorkAction: mockPutToWork,
}))
// The panel refreshes after a request so the new card shows up in the stack.
vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  useRouter: () => ({ refresh: vi.fn() }),
}))

beforeEach(() => {
  mockAsk.mockClear()
  mockPutToWork.mockClear()
})

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

  // ── PUTTING THE TEAM TO WORK (D8) ──────────────────────────────────────
  it('offers to draft work as a BUTTON, not a link — it starts something rather than going somewhere', async () => {
    mockAsk.mockResolvedValueOnce({
      ok: true,
      answer: 'Posting has been light this month.',
      actions: [],
      requests: [{ kind: 'draft_social', label: 'Draft a post for me' }],
    })
    render(<SandmanPanel clinicName="Acme Dental" />)
    fireEvent.click(screen.getByRole('button', { name: 'What should we do this week to bring more in?' }))
    const btn = await screen.findByRole('button', { name: 'Draft a post for me' })
    expect(btn.tagName).toBe('BUTTON')
    // And the promise is stated where the finger is: a draft, not a send.
    expect(screen.getByText(/nothing goes out until you approve it/i)).toBeInTheDocument()
  })

  it('a tapped request runs it and reports what happened in the thread', async () => {
    mockAsk.mockResolvedValueOnce({
      ok: true,
      answer: 'Posting has been light this month.',
      actions: [],
      requests: [{ kind: 'draft_social', label: 'Draft a post for me' }],
    })
    render(<SandmanPanel clinicName="Acme Dental" />)
    fireEvent.click(screen.getByRole('button', { name: 'What should we do this week to bring more in?' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Draft a post for me' }))
    await waitFor(() => expect(mockPutToWork).toHaveBeenCalledWith({ kind: 'draft_social' }))
    expect(await screen.findByText(/a post is drafted and waiting on your yes/i)).toBeInTheDocument()
  })

  it('a request can only be asked for ONCE — the answer becomes a record, not a repeatable offer', async () => {
    mockAsk.mockResolvedValueOnce({
      ok: true,
      answer: 'Posting has been light this month.',
      actions: [],
      requests: [{ kind: 'draft_social', label: 'Draft a post for me' }],
    })
    render(<SandmanPanel clinicName="Acme Dental" />)
    fireEvent.click(screen.getByRole('button', { name: 'What should we do this week to bring more in?' }))
    const btn = await screen.findByRole('button', { name: 'Draft a post for me' })
    fireEvent.click(btn)
    await waitFor(() => expect(mockPutToWork).toHaveBeenCalledTimes(1))
    const after = screen.getByRole('button', { name: /On it…|Draft a post for me/ })
    expect(after).toBeDisabled()
  })

  it('a request that fails answers in the thread rather than throwing the panel away', async () => {
    mockAsk.mockResolvedValueOnce({
      ok: true,
      answer: 'Posting has been light this month.',
      actions: [],
      requests: [{ kind: 'draft_social', label: 'Draft a post for me' }],
    })
    mockPutToWork.mockRejectedValueOnce(new Error('network'))
    render(<SandmanPanel clinicName="Acme Dental" />)
    fireEvent.click(screen.getByRole('button', { name: 'What should we do this week to bring more in?' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Draft a post for me' }))
    expect(await screen.findByText(/didn’t go through/i)).toBeInTheDocument()
  })
})
