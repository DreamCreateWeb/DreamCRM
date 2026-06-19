/**
 * In-app confirm dialog. The Promise-based useConfirm() resolves true on
 * confirm and false on every dismissal (Cancel button, Escape, backdrop), so a
 * call site stays a one-line guard. role="dialog" + aria-modal + a labelled
 * title make it screen-reader-correct.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { ConfirmProvider, useConfirm, useConfirmSafe } from '@/components/ui/confirm-dialog'

function Harness() {
  const confirm = useConfirm()
  const [result, setResult] = useState('none')
  return (
    <div>
      <button
        onClick={async () =>
          setResult(String(await confirm({ title: 'Delete this?', message: 'This cannot be undone.', danger: true, confirmLabel: 'Delete' })))
        }
      >
        go
      </button>
      <span data-testid="result">{result}</span>
    </div>
  )
}

function open() {
  render(
    <ConfirmProvider>
      <Harness />
    </ConfirmProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'go' }))
  return screen.getByRole('dialog')
}

const result = () => screen.getByTestId('result').textContent

describe('useConfirm', () => {
  it('opens a labelled modal dialog with the options', () => {
    const dialog = open()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Delete this?')).toBeTruthy()
    expect(screen.getByText('This cannot be undone.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('resolves true when confirmed', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(result()).toBe('true'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('resolves false when cancelled', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(result()).toBe('false'))
  })

  it('resolves false on Escape', async () => {
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(result()).toBe('false'))
  })

  it('resolves false on backdrop click', async () => {
    const dialog = open()
    fireEvent.click(dialog.parentElement as HTMLElement)
    await waitFor(() => expect(result()).toBe('false'))
  })
})

describe('useConfirm guard', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  it('throws when used outside a provider', () => {
    expect(() => render(<Harness />)).toThrow(/ConfirmProvider/)
  })
})

describe('useConfirmSafe (shared components outside a provider)', () => {
  function SafeHarness() {
    const confirm = useConfirmSafe()
    const [r, setR] = useState('none')
    return (
      <button onClick={async () => setR(String(await confirm({ title: 'Delete?' })))} data-r={r}>
        {r}
      </button>
    )
  }

  it('falls back to native window.confirm instead of throwing', async () => {
    window.confirm = vi.fn(() => true)
    render(<SafeHarness />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('true'))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('uses the in-app dialog when a provider IS present', async () => {
    render(
      <ConfirmProvider>
        <SafeHarness />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button'))
    // The modal dialog appears rather than a native prompt.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
