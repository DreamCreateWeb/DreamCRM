/**
 * components/ui/build-watch.tsx — a tab that outlives the deploy that
 * replaced its server gets one calm Refresh, and the Studio gets an event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/build-id', () => ({ BUILD_ID: 'build-aaa' }))

import BuildWatch, { BUILD_STALE_EVENT, BUILD_WATCH_INTERVAL_MS, fetchServerBuild } from '@/components/ui/build-watch'

function mockVersion(build: string | null) {
  const fetchMock = vi.fn(async () =>
    build === null
      ? ({ ok: false, json: async () => ({}) } as Response)
      : ({ ok: true, json: async () => ({ build }) } as Response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('BuildWatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('stays silent while the server runs the same build', async () => {
    mockVersion('build-aaa')
    render(<BuildWatch />)
    await act(async () => {
      vi.advanceTimersByTime(BUILD_WATCH_INTERVAL_MS + 10)
    })
    expect(screen.queryByTestId('build-watch')).toBeNull()
  })

  it('offers a Refresh (and tells the Studio) once the server is a different build', async () => {
    mockVersion('build-bbb')
    const heard = vi.fn()
    window.addEventListener(BUILD_STALE_EVENT, heard)
    render(<BuildWatch />)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.getByTestId('build-watch').textContent).toMatch(/updated while this tab was open/)
    expect(heard).toHaveBeenCalled()
    window.removeEventListener(BUILD_STALE_EVENT, heard)
    // Dismissable; the Refresh button reloads.
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(reload).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByTestId('build-watch')).toBeNull()
  })

  it('an unreadable answer is not a redeploy', async () => {
    mockVersion(null)
    expect(await fetchServerBuild()).toBeNull()
    render(<BuildWatch />)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.queryByTestId('build-watch')).toBeNull()
  })
})
