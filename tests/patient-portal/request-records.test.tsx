import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The records page's old "call us" card is now a real, tracked request: one tap
 * sends an inbound message to the front desk and confirms in-place, pointing the
 * patient at their portal messages for the reply. Phone stays as a fallback.
 */

const requestMyRecordsAction = vi.fn<() => Promise<{ ok: true } | { ok: false; error: string }>>(
  async () => ({ ok: true }),
)
vi.mock('@/app/(portal)/patient/actions', () => ({
  requestMyRecordsAction: () => requestMyRecordsAction(),
}))

import RequestRecordsCard from '@/app/(portal)/patient/records/request-records'

beforeEach(() => {
  requestMyRecordsAction.mockClear()
  requestMyRecordsAction.mockResolvedValue({ ok: true })
})

describe('RequestRecordsCard', () => {
  it('offers the request button plus a phone fallback', () => {
    render(<RequestRecordsCard brand="#0a7d72" phone="555-0100" />)
    expect(screen.getByRole('button', { name: 'Request my records' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '555-0100' })).toBeTruthy()
  })

  it('sends the request and confirms in-place, pointing at messages', async () => {
    render(<RequestRecordsCard brand="#0a7d72" phone={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request my records' }))
    await waitFor(() => expect(requestMyRecordsAction).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Request sent/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'messages' })).toBeTruthy()
    // The button is gone once sent — no accidental double request.
    expect(screen.queryByRole('button', { name: 'Request my records' })).toBeNull()
  })

  it('surfaces an error and keeps the button when the action fails', async () => {
    requestMyRecordsAction.mockResolvedValueOnce({ ok: false, error: 'Something broke' })
    render(<RequestRecordsCard brand="#0a7d72" phone={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request my records' }))
    expect(await screen.findByText(/Something broke/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request my records' })).toBeTruthy()
  })
})
