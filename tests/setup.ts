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
