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
