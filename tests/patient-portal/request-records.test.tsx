import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, configure } from '@testing-library/react'

// Same load-flake class as survey-card: this card drives an async action
// through a transition, and the library's 1s default can lose the race under
// full-suite parallel load. Raised for this file only (see docs/RELEASE.md).
configure({ asyncUtilTimeout: 5_000 })

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

    // Wait for the SETTLED button, not just for the error text.
    //
    // `setError` is called INSIDE the `useTransition` callback, and while that
    // transition is pending the button renders 'Sending…' rather than its
    // label. React can therefore paint the error paragraph with the button
    // still in its pending name, so `findByText(/Something broke/)` returning
    // did NOT mean the interaction had finished — and the next line asked for
    // the button BY its settled name, synchronously. It won on a quiet machine
    // and lost under full-suite parallel load (isolated: 3/3 green; in the
    // full run: red).
    //
    // Note the file's `asyncUtilTimeout` bump above could never have helped
    // here: the assertion that failed was synchronous, so there was no timeout
    // to raise. This is the same defect as `tests/patients/digest-toggle.test.tsx`
    // — settle on the accessible name, then assert the rest.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Request my records' })).toBeTruthy())
    expect(screen.getByText(/Something broke/)).toBeTruthy()
  })
})
