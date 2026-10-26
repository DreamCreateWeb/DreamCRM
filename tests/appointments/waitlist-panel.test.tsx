import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'

/**
 * The fast-pass panel on /appointments stays MOUNTED across router.refresh(),
 * so its hook sequence has to be identical whether the list is empty or not.
 * It used to call useConfirm() AFTER `if (entries.length === 0) return null`
 * — a rules-of-hooks violation the project's a11y-only lint never sees.
 * (useConfirm is a bare useContext, which React 19 tolerates silently today;
 * the moment it grows a stateful hook, 1 → 0 entries throws "rendered fewer
 * hooks" and 0 → 2 "rendered more", on the page the desk lives in.) This
 * renders the panel inside the REAL ConfirmProvider and walks exactly that
 * sequence, with the hook hoisted above the early return.
 */

const removeFromWaitlistAction = vi.fn(async (_id: string) => undefined)
vi.mock('@/app/(default)/appointments/actions', () => ({
  removeFromWaitlistAction: (id: string) => removeFromWaitlistAction(id),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import WaitlistPanel, { type WaitlistPanelEntry } from '@/app/(default)/appointments/waitlist-panel'

function entry(over: Partial<WaitlistPanelEntry> = {}): WaitlistPanelEntry {
  return {
    id: 'wait_1',
    patientId: 'pat_1',
    patientName: 'Mia Hayes',
    visitTypeLabel: 'Cleaning',
    providerName: null,
    currentVisitAtIso: null,
    pendingOffers: 0,
    ...over,
  }
}

beforeEach(() => {
  removeFromWaitlistAction.mockClear()
})

describe('WaitlistPanel — hooks before the early return', () => {
  it('survives the list going 1 → 0 → 2 entries without a hook-order throw', () => {
    const { rerender } = render(
      <ConfirmProvider>
        <WaitlistPanel entries={[entry()]} />
      </ConfirmProvider>,
    )
    expect(screen.getByText('Fast-pass list')).toBeTruthy()

    // The only patient is taken off → the panel renders nothing. This is the
    // render that used to throw "Rendered fewer hooks than expected".
    expect(() =>
      rerender(
        <ConfirmProvider>
          <WaitlistPanel entries={[]} />
        </ConfirmProvider>,
      ),
    ).not.toThrow()
    expect(screen.queryByText('Fast-pass list')).toBeNull()

    // Two join → it comes back. This is the render that used to throw
    // "Rendered more hooks than during the previous render".
    expect(() =>
      rerender(
        <ConfirmProvider>
          <WaitlistPanel entries={[entry(), entry({ id: 'wait_2', patientId: 'pat_2', patientName: 'Leo Park' })]} />
        </ConfirmProvider>,
      ),
    ).not.toThrow()
    expect(screen.getByText('Fast-pass list')).toBeTruthy()
    expect(screen.getByText('(2)')).toBeTruthy()
  })

  it('Remove asks the real confirm dialog first, then calls the action on yes', async () => {
    render(
      <ConfirmProvider>
        <WaitlistPanel entries={[entry()]} />
      </ConfirmProvider>,
    )
    // Expand the strip, then click Remove.
    fireEvent.click(screen.getByText('Fast-pass list'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Take Mia Hayes off the fast-pass list?')
    expect(removeFromWaitlistAction).not.toHaveBeenCalled()

    // The dialog's confirm button carries the same word as the row's — scope to the dialog.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeFromWaitlistAction).toHaveBeenCalledWith('wait_1'))
  })
})
