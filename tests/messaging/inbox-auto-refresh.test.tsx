import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * The inbox live-refresh helper: a soft router.refresh() on tab focus +
 * visibility, throttled so focus + interval can't stack into a refresh storm.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import InboxAutoRefresh from '@/app/(double-sidebar)/messages/inbox-auto-refresh'

beforeEach(() => {
  refresh.mockClear()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('<InboxAutoRefresh />', () => {
  it('refreshes when the window regains focus', () => {
    render(<InboxAutoRefresh />)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('throttles back-to-back triggers (≤1 per 15s)', () => {
    render(<InboxAutoRefresh />)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
    // After the throttle window, a focus refreshes again.
    vi.advanceTimersByTime(16_000)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('stops listening after unmount', () => {
    const { unmount } = render(<InboxAutoRefresh />)
    unmount()
    window.dispatchEvent(new Event('focus'))
    expect(refresh).not.toHaveBeenCalled()
  })
})
