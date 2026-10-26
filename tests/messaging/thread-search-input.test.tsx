import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

/**
 * The thread search box keeps EVERY active filter when it rebuilds the URL.
 * It used to rebuild from a hand-picked trio (status / assignedTo / unread),
 * so typing a name while on ★ Starred navigated to an unstarred list and a
 * widened ?show= page collapsed — while the chip still looked active.
 */

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}))

import ThreadSearchInput from '@/app/(double-sidebar)/messages/thread-search-input'

beforeEach(() => {
  vi.useFakeTimers()
  replace.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

function typeAndSettle(container: HTMLElement, text: string) {
  const input = container.querySelector('input')!
  fireEvent.change(input, { target: { value: text } })
  act(() => {
    vi.advanceTimersByTime(350)
  })
}

describe('ThreadSearchInput — filters survive a search', () => {
  it('keeps starred (and every other filter) and drops thread + show', () => {
    const { container } = render(
      <ThreadSearchInput
        defaultQuery=""
        baseParams={{ starred: '1', status: 'all', assignedTo: 'me', unread: '1', show: '300', thread: 'thr_7' }}
      />,
    )
    typeAndSettle(container, 'mia')
    expect(replace).toHaveBeenCalledTimes(1)
    const url = new URL(replace.mock.calls[0][0] as string, 'https://x.test')
    expect(url.pathname).toBe('/messages')
    expect(url.searchParams.get('starred')).toBe('1')
    expect(url.searchParams.get('status')).toBe('all')
    expect(url.searchParams.get('assignedTo')).toBe('me')
    expect(url.searchParams.get('unread')).toBe('1')
    expect(url.searchParams.get('q')).toBe('mia')
    // A new search refilters the list (the open thread may be gone) and
    // starts at page one.
    expect(url.searchParams.get('thread')).toBeNull()
    expect(url.searchParams.get('show')).toBeNull()
  })

  it('does not navigate on mount — the URL already reflects the default query', () => {
    render(<ThreadSearchInput defaultQuery="mia" baseParams={{ q: 'mia', starred: '1' }} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(replace).not.toHaveBeenCalled()
  })

  it('clearing the box drops q but keeps the filters', () => {
    const { container } = render(<ThreadSearchInput defaultQuery="mia" baseParams={{ q: 'mia', starred: '1' }} />)
    typeAndSettle(container, '')
    const url = new URL(replace.mock.calls[0][0] as string, 'https://x.test')
    expect(url.searchParams.get('q')).toBeNull()
    expect(url.searchParams.get('starred')).toBe('1')
  })
})
