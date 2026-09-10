/**
 * My Day's personal "morning email" switch. Pins: it reflects the initial
 * opt-out, toggling calls the action with the flipped value and updates the
 * label, and a failed save reverts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const setMyDigestOptOutAction = vi.fn()
vi.mock('@/app/(default)/my-day/actions', () => ({
  setMyDigestOptOutAction: (...a: unknown[]) => setMyDigestOptOutAction(...a),
}))

import DigestToggle from '@/app/(default)/my-day/digest-toggle'

beforeEach(() => {
  setMyDigestOptOutAction.mockReset().mockResolvedValue({ ok: true })
})

describe('DigestToggle', () => {
  it('shows On + a Turn off control when opted in', () => {
    render(<DigestToggle initialOptedOut={false} />)
    expect(screen.getByText('On')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
  })

  it('mutes (calls the action with true) and flips the label', async () => {
    render(<DigestToggle initialOptedOut={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))

    // Wait for the SETTLED state, not for the mock to have been called.
    //
    // The toggle saves inside a `useTransition`, and while that transition is
    // pending the button renders '…' rather than its label. Waiting on
    // `toHaveBeenCalledWith` returns the instant the action fires — with the
    // transition still pending — so asserting the label on the next
    // synchronous line was a race with React flushing `pending` back to false.
    // It won on a quiet machine and lost on a loaded CI worker: this file went
    // red intermittently for days and eventually took down a deploy on `main`
    // (run 34433995622), while passing in isolation every time.
    //
    // The button's accessible name is the honest signal that the whole
    // interaction finished — the sibling test below already waits on rendered
    // output for the same reason.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy())
    expect(setMyDigestOptOutAction).toHaveBeenCalledWith(true)
    expect(screen.getByText('Off')).toBeTruthy()
  })

  it('reverts on a failed save', async () => {
    setMyDigestOptOutAction.mockResolvedValue({ error: 'nope' })
    render(<DigestToggle initialOptedOut={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy())
    // Rolled back to opted-in.
    expect(screen.getByText('On')).toBeTruthy()
  })
})
