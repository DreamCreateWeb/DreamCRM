/**
 * Shared route error boundary UI + a representative group wrapper. A thrown
 * render/data error must show a calm recover card (never Next's raw screen):
 * the message + a "Try again" that calls reset() + a "Reload the page" fallback,
 * with role="alert" for assistive tech and the digest ref when present.
 *
 * And the one error a retry cannot fix (2026-10-26): a server action refused
 * because the tab is from an older build. There the card reads the stale-app
 * line, offers Refresh as its ONLY button, and never calls reset().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RouteError from '@/components/ui/route-error'
import DashboardError from '@/app/(default)/error'
import { STALE_APP_MESSAGE } from '@/lib/deployment-skew'

const SKEW = 'Failed to find Server Action "abc". This request might be from an older or newer deployment.'

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

describe('a stale build — the error a retry cannot fix', () => {
  it('reads the stale-app line, offers Refresh only, and never calls reset()', () => {
    const reset = vi.fn()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    render(<RouteError error={new Error(SKEW)} reset={reset} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(STALE_APP_MESSAGE)).toBeTruthy()
    // "Trying again usually fixes it" is false here and is not shown.
    expect(screen.queryByText(/Trying again/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reload the page' })).toBeNull()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it('recognises the refusal when it rides the digest (the server-thrown shape)', () => {
    const err = Object.assign(new Error('An error occurred in the Server Components render.'), { digest: SKEW })
    render(<RouteError error={err} reset={vi.fn()} />)
    expect(screen.getByText(STALE_APP_MESSAGE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    // The digest ref still prints — it is what a person quotes back to us.
    expect(screen.getByText(/Ref: /)).toBeTruthy()
  })

  it('overrides a wrapper’s own message and retry label — the dashboard boundary included', () => {
    render(<DashboardError error={new Error(SKEW)} reset={vi.fn()} />)
    expect(screen.getByText(STALE_APP_MESSAGE)).toBeTruthy()
    expect(screen.queryByText(/your data is safe/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
  })

  it('still logs the error with its scope, so a skew hit at the boundary is countable in prod', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RouteError error={new Error(SKEW)} reset={vi.fn()} scope="patients" />)
    expect(spy).toHaveBeenCalledWith('[route error boundary: patients]', expect.any(Error))
  })

  it('leaves an ordinary error on the retry path', () => {
    const reset = vi.fn()
    render(<RouteError error={new Error('boom')} reset={reset} />)
    expect(screen.queryByText(STALE_APP_MESSAGE)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
