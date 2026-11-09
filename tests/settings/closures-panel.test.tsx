import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * Settings → Holiday closures (ML-51): the empty state carries a door, the
 * presets are one tap, every await goes through runAction, and removing asks
 * first (the dialog law) — a "no" never reaches the server.
 */
const { addClosureAction, addPresetClosuresAction, removeClosureAction, confirmMock, refreshMock } = vi.hoisted(() => ({
  addClosureAction: vi.fn(async (_i: unknown) => ({ ok: true as const })),
  addPresetClosuresAction: vi.fn(async (_k: string[]) => ({ ok: true as const })),
  removeClosureAction: vi.fn(async (_id: string) => ({ ok: true as const })),
  confirmMock: vi.fn(async (_o?: unknown) => true),
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))
vi.mock('@/app/(default)/settings/closures/actions', () => ({ addClosureAction, addPresetClosuresAction, removeClosureAction }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmMock }))

import ClosuresPanel from '@/app/(default)/settings/closures/closures-panel'
import { holidayPresets } from '@/lib/closures'

const todayKey = '2026-11-09'
const presets = holidayPresets(todayKey)

function data(over: Record<string, unknown> = {}) {
  return { canEdit: true, todayKey, closures: [], presets, gbp: [], ...over } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  confirmMock.mockImplementation(async () => true)
})
afterEach(() => cleanup())

describe('ClosuresPanel', () => {
  it('an empty list says so and offers the door — the usual holidays, one tap', async () => {
    render(<ClosuresPanel initial={data()} />)
    expect(screen.getByText('No closures on the calendar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add the usual holidays' }))
    await waitFor(() => expect(addPresetClosuresAction).toHaveBeenCalledTimes(1))
    const keys = addPresetClosuresAction.mock.calls[0][0]
    expect(keys).toEqual(expect.arrayContaining(['thanksgiving-2026', 'christmas-2026']))
    // One year of each, not two.
    expect(new Set(keys.map((k) => k.replace(/-\d{4}$/, ''))).size).toBe(keys.length)
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('a preset is one tap and sends only its key', async () => {
    render(<ClosuresPanel initial={data()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Thanksgiving · Nov 26–27$/ }))
    await waitFor(() => expect(addPresetClosuresAction).toHaveBeenCalledWith(['thanksgiving-2026']))
  })

  it('lists the stated closures and removes one only after the dialog says yes', async () => {
    const closures = [{ id: 'c1', startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' }]
    render(<ClosuresPanel initial={data({ closures })} />)
    expect(screen.getByText('Nov 26–27')).toBeTruthy()

    confirmMock.mockImplementationOnce(async () => false)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    expect(removeClosureAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeClosureAction).toHaveBeenCalledWith('c1'))
  })

  it('a refusal from the server is shown, not swallowed', async () => {
    addPresetClosuresAction.mockImplementationOnce(async () => ({ ok: false, error: 'Those holidays are not on the list anymore.' }) as never)
    render(<ClosuresPanel initial={data()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Thanksgiving · Nov 26–27$/ }))
    expect(await screen.findByText('Those holidays are not on the list anymore.')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('a thrown action (a redeploy under the tab) resets the button and says so', async () => {
    addPresetClosuresAction.mockImplementationOnce(async () => {
      throw new Error('network')
    })
    render(<ClosuresPanel initial={data()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Thanksgiving · Nov 26–27$/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Thanksgiving · Nov 26–27$/ }).hasAttribute('disabled')).toBe(false))
  })

  it('Google’s special hours sit beside the list, read-only', () => {
    render(<ClosuresPanel initial={data({ gbp: [{ startsOn: '2026-12-24', endsOn: '2026-12-25', label: 'Christmas' }] })} />)
    expect(screen.getByText('On your Google listing')).toBeTruthy()
    expect(screen.getByText('Dec 24–25')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
  })

  it('staff who cannot edit see the list but no controls', () => {
    const closures = [{ id: 'c1', startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' }]
    render(<ClosuresPanel initial={data({ canEdit: false, closures })} />)
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add closure' })).toBeNull()
  })
})
