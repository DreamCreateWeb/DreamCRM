/**
 * Shared route error boundary UI + a representative group wrapper. A thrown
 * render/data error must show a calm recover card (never Next's raw screen):
 * the message + a "Try again" that calls reset() + a "Reload the page" fallback,
 * with role="alert" for assistive tech and the digest ref when present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RouteError from '@/components/ui/route-error'
import DashboardError from '@/app/(default)/error'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('RouteError', () => {
  it('renders an alert with the message and a working retry', () => {
    const reset = vi.fn()
    render(<RouteError error={new Error('boom')} reset={reset} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('offers a hard-reload fallback', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    render(<RouteError error={new Error('boom')} reset={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload the page' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows the digest ref when present (and not when absent)', () => {
    const err = Object.assign(new Error('x'), { digest: 'abc123' })
    const { rerender } = render(<RouteError error={err} reset={vi.fn()} />)
    expect(screen.getByText(/Ref: abc123/)).toBeTruthy()
    rerender(<RouteError error={new Error('x')} reset={vi.fn()} />)
    expect(screen.queryByText(/Ref:/)).toBeNull()
  })

  it('logs the error with its scope for prod diagnosis', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RouteError error={new Error('boom')} reset={vi.fn()} scope="patients" />)
    expect(spy).toHaveBeenCalledWith('[route error boundary: patients]', expect.any(Error))
  })
})

describe('DashboardError wrapper', () => {
  it('renders the shared card with dashboard copy', () => {
    render(<DashboardError error={new Error('x')} reset={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/your data is safe/)).toBeTruthy()
  })
})
