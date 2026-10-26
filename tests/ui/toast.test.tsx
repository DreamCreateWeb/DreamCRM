/**
 * App-wide toast provider — replaces native alert() for action feedback. The
 * hook surfaces a FlashToast at the provider; using it outside the provider
 * throws (so a stray call is caught at render).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastProvider, useToast } from '@/components/ui/toast'

function Harness() {
  const toast = useToast()
  return <button onClick={() => toast('Saved.', { tone: 'ok' })}>go</button>
}

describe('useToast', () => {
  it('shows the message via a status toast', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    const toast = screen.getByRole('status')
    expect(toast.textContent).toBe('Saved.')
  })

  it('throws when used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Harness />)).toThrow(/ToastProvider/)
  })
})

/**
 * A QUEUE, NOT A SLOT (2026-10-26). The provider held ONE toast, so a second
 * call replaced the first mid-read. Now up to three stack (newest last), an
 * identical message+tone is not added twice, and at the cap the oldest
 * NON-urgent toast makes room first — an unread error is the last to go.
 */
import { enqueueToast, MAX_VISIBLE_TOASTS } from '@/components/ui/toast'

function MultiHarness() {
  const toast = useToast()
  return (
    <>
      <button onClick={() => toast('Saved.')}>ok</button>
      <button onClick={() => toast('Sent.')}>sent</button>
      <button onClick={() => toast('Tagged.')}>tagged</button>
      <button onClick={() => toast('Could not send', { tone: 'urgent' })}>err</button>
    </>
  )
}

const shown = () => Array.from(screen.getByTestId('toast-stack').children).map((el) => el.textContent)

describe('ToastProvider — a queue, not a slot', () => {
  it('stacks a second toast under the first instead of replacing it mid-read', () => {
    render(
      <ToastProvider>
        <MultiHarness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ok' }))
    fireEvent.click(screen.getByRole('button', { name: 'sent' }))
    expect(shown()).toEqual(['Saved.', 'Sent.'])
  })

  it('does not add an identical toast twice', () => {
    render(
      <ToastProvider>
        <MultiHarness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ok' }))
    fireEvent.click(screen.getByRole('button', { name: 'ok' }))
    expect(shown()).toEqual(['Saved.'])
  })

  it('caps at three and drops the oldest non-urgent first, so an error stays readable', () => {
    render(
      <ToastProvider>
        <MultiHarness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'err' }))
    fireEvent.click(screen.getByRole('button', { name: 'ok' }))
    fireEvent.click(screen.getByRole('button', { name: 'sent' }))
    fireEvent.click(screen.getByRole('button', { name: 'tagged' }))
    expect(shown()).toEqual(['Could not send', 'Sent.', 'Tagged.'])
    expect(screen.getByRole('alert')).toHaveTextContent('Could not send')
  })

  it('Dismiss removes only that toast', () => {
    render(
      <ToastProvider>
        <MultiHarness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ok' }))
    fireEvent.click(screen.getByRole('button', { name: 'sent' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0])
    expect(shown()).toEqual(['Sent.'])
  })

  it('enqueueToast is pure and holds the three rules', () => {
    const t = (id: number, message: string, tone: 'ok' | 'urgent' | 'neutral' = 'ok') => ({ id, message, tone })
    expect(MAX_VISIBLE_TOASTS).toBe(3)
    const q = enqueueToast([t(1, 'a')], t(2, 'a'))
    expect(q).toEqual([t(1, 'a')])
    const full = [t(1, 'x', 'urgent'), t(2, 'b'), t(3, 'c')]
    expect(enqueueToast(full, t(4, 'd')).map((e) => e.id)).toEqual([1, 3, 4])
    const allUrgent = [t(1, 'x', 'urgent'), t(2, 'y', 'urgent'), t(3, 'z', 'urgent')]
    expect(enqueueToast(allUrgent, t(4, 'w', 'urgent')).map((e) => e.id)).toEqual([2, 3, 4])
  })
})
