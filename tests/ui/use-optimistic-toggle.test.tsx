/**
 * useOptimisticToggle — the UI flips immediately on click, the action runs with
 * the new value, and a failed write surfaces onError (and doesn't refresh, so
 * React reverts the optimistic value to the server one).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useOptimisticToggle } from '@/components/ui/use-optimistic-toggle'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

function Switch({
  initial,
  action,
  onError,
}: {
  initial: boolean
  action: (next: boolean) => Promise<{ ok: boolean; error?: string }>
  onError?: (m: string) => void
}) {
  const t = useOptimisticToggle(initial, action, { onError })
  return (
    <button data-state={String(t.value)} disabled={t.pending} onClick={t.toggle}>
      {t.value ? 'on' : 'off'}
    </button>
  )
}

beforeEach(() => refresh.mockClear())

describe('useOptimisticToggle', () => {
  it('flips the UI immediately and calls the action with the new value', async () => {
    const action = vi.fn(async () => ({ ok: true }))
    render(<Switch initial={false} action={action} />)
    expect(screen.getByRole('button').textContent).toBe('off')
    fireEvent.click(screen.getByRole('button'))
    // Optimistic flip is visible right away.
    expect(screen.getByRole('button').textContent).toBe('on')
    await waitFor(() => expect(action).toHaveBeenCalledWith(true))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('surfaces onError and does not refresh when the write fails', async () => {
    const onError = vi.fn()
    const action = vi.fn(async () => ({ ok: false, error: 'Nope' }))
    render(<Switch initial={false} action={action} onError={onError} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Nope'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('catches a thrown (void) action and reports it', async () => {
    const onError = vi.fn()
    const action = vi.fn(async () => {
      throw new Error('boom')
    })
    render(<Switch initial={false} action={action} onError={onError} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('boom'))
    expect(refresh).not.toHaveBeenCalled()
  })
})
