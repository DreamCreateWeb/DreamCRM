import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * `next/cache` is mocked suite-wide because `unstable_cache` throws outside a
 * Next request scope ("Invariant: incrementalCache missing"), which no unit
 * test has. The double in `tests/mocks/next-cache.ts` is not a pass-through:
 * it round-trips a cache HIT through JSON exactly as production does, so a
 * payload that only works on the miss path fails here instead of in front of a
 * clinic. See that file's header for why the distinction matters.
 */
vi.mock('next/cache', () => import('./mocks/next-cache'))

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  // Cached entries must not leak between tests — a stale hit from a previous
  // test's fixture is a confusing failure in an unrelated one.
  const { __resetNextCache } = await import('./mocks/next-cache')
  __resetNextCache()
})

/**
 * NO TEST TOUCHES THE NETWORK. happy-dom resolves a relative or localhost URL
 * to http://localhost:3000 (its default origin), where nothing listens in CI:
 * the request used to fail as an unhandled ClientRequest 'error' that killed
 * the worker ("connect ECONNREFUSED 127.0.0.1:3000") with no hint of which
 * test asked. Reject it HERE instead, naming the URL, so the offending test
 * fails loudly on its own line. A test that wants a response stubs fetch
 * (`vi.stubGlobal('fetch', …)`), which replaces this guard for that test.
 */
const realFetch = globalThis.fetch
if (typeof realFetch === 'function') {
  globalThis.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let local = false
    try {
      const u = new URL(raw, globalThis.location?.href ?? 'http://localhost:3000')
      local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    } catch {
      local = true
    }
    if (local) {
      return Promise.reject(
        new TypeError(`tests must not hit the network: fetch(${JSON.stringify(raw)}) resolves to localhost — stub fetch in this test`),
      )
    }
    return realFetch.call(globalThis, input, init)
  } as typeof fetch
}

/**
 * The same law for XMLHttpRequest. Importing the real `@playwright/test` under
 * happy-dom installs playwright's bundled source-map-support, which — seeing a
 * `window` — formats a stack frame by SYNCHRONOUSLY XHR-ing the frame's file
 * from http://localhost:3000/<abs path>. happy-dom runs a sync XHR in a child
 * node process whose unhandled ClientRequest 'error' crashed the worker. A
 * refused sync XHR is a NetworkError in a browser, so throw exactly that and
 * never spawn the child.
 */
const XHR = globalThis.XMLHttpRequest
if (XHR) {
  const realOpen = XHR.prototype.open
  XHR.prototype.open = function guardedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    let local = false
    try {
      local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(String(url), globalThis.location?.href ?? 'http://localhost:3000').hostname)
    } catch {
      local = true
    }
    if (local) {
      throw new DOMException(`tests must not hit the network: XMLHttpRequest ${method} ${String(url)} resolves to localhost`, 'NetworkError')
    }
    return (realOpen as (...a: unknown[]) => void).call(this, method, url, ...rest)
  } as typeof XHR.prototype.open
}
