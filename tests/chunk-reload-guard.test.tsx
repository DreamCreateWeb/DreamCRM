import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ChunkReloadGuard, { isChunkLoadFailure } from '@/components/chunk-reload-guard'

/**
 * The deploy-skew chunk guard. After a deploy, an already-open page references
 * JS chunks by an old hash that the new server no longer serves → a 404 that the
 * browser rejects as a script → a fatal "Application error". This guard detects
 * that and reloads ONCE (loop-guarded), so a subscriber never sees the crash.
 */

describe('isChunkLoadFailure', () => {
  it('matches chunk-load / dynamic-import / MIME failure messages', () => {
    expect(isChunkLoadFailure({ message: 'Failed to load chunk /_next/static/chunks/abc.js from module 1' })).toBe(true)
    expect(isChunkLoadFailure({ message: 'ChunkLoadError: Loading chunk 123 failed' })).toBe(true)
    expect(isChunkLoadFailure({ message: "Refused to execute script — MIME type ('text/plain') is not executable" })).toBe(true)
    expect(isChunkLoadFailure({ message: 'Failed to fetch dynamically imported module: https://x/_next/static/y.js' })).toBe(true)
  })

  it('matches a failed _next/static <script> resource (no message)', () => {
    expect(isChunkLoadFailure({ tag: 'SCRIPT', src: 'https://x/_next/static/chunks/5d6bc24380263317.js' })).toBe(true)
  })

  it('ignores ordinary errors + non-_next resources', () => {
    expect(isChunkLoadFailure({ message: 'TypeError: x is not a function' })).toBe(false)
    expect(isChunkLoadFailure({ tag: 'IMG', src: 'https://x/_next/static/photo.png' })).toBe(false)
    expect(isChunkLoadFailure({ tag: 'SCRIPT', src: 'https://cdn/analytics.js' })).toBe(false)
    expect(isChunkLoadFailure({})).toBe(false)
  })
})

describe('ChunkReloadGuard', () => {
  const reload = vi.fn()
  let original: Location

  beforeEach(() => {
    reload.mockReset()
    window.sessionStorage.clear()
    original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })

  function fireChunkError() {
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'Failed to load chunk /_next/static/chunks/abc.js from module 651322' }),
    )
  }

  it('reloads once on a stale-chunk error', () => {
    render(<ChunkReloadGuard />)
    fireChunkError()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not loop — a second failure within the window is ignored', () => {
    render(<ChunkReloadGuard />)
    fireChunkError()
    fireChunkError()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('recovers from a chunk error surfaced as an unhandled rejection', () => {
    render(<ChunkReloadGuard />)
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown }
    ev.reason = new Error('ChunkLoadError: Loading chunk 42 failed')
    window.dispatchEvent(ev)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ignores ordinary application errors (no reload)', () => {
    render(<ChunkReloadGuard />)
    window.dispatchEvent(new ErrorEvent('error', { message: 'TypeError: cannot read properties of undefined' }))
    expect(reload).not.toHaveBeenCalled()
  })
})
