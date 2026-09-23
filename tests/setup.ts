import { afterEach, vi } from 'vitest'

/**
 * `next/cache` is mocked suite-wide because `unstable_cache` throws outside a
 * Next request scope ("Invariant: incrementalCache missing"), which no unit
 * test has. The double in `tests/mocks/next-cache.ts` is not a pass-through:
 * it round-trips a cache HIT through JSON exactly as production does, so a
 * payload that only works on the miss path fails here instead of in front of a
 * clinic. See that file's header for why the distinction matters.
 */
vi.mock('next/cache', () => import('./mocks/next-cache'))

/**
 * THE DOM HALF IS LOADED ONLY WHERE THERE IS A DOM (DREAMCRM-115).
 *
 * The suite's default environment is `node`; a `.test.tsx` gets `happy-dom`
 * from its project and a `.test.ts` gets it by writing
 * `// @vitest-environment happy-dom` at the top of the file. See
 * `vitest.config.ts` for why, and for the measurement.
 *
 * This file runs in BOTH, so it asks the environment rather than being told.
 * `typeof document` is the answer to the question the imports below actually
 * care about — "is there a document to clean up" — rather than a proxy for it
 * like the file extension or a list of paths. A file that changes environment
 * therefore changes what setup it gets, with nothing here to update.
 *
 * WHY NOT TWO SETUP FILES, one per project: because the per-file docblock
 * would then be a half-measure. A `.test.ts` opting into `happy-dom` stays in
 * the `node` project, so it would get the node setup and lose `jest-dom`'s
 * matchers — a `toBeInTheDocument` failing as "not a function" in a file that
 * correctly asked for a window. One file that reads the environment has no
 * such seam.
 *
 * `@testing-library/jest-dom/vitest` registers matchers as an import side
 * effect and `cleanup` unmounts whatever React rendered, so both are dynamic
 * imports inside the branch. In `node` they are never loaded at all, which is
 * also the point: they are not free.
 */
const hasDom = typeof document !== 'undefined'

if (hasDom) {
  await import('@testing-library/jest-dom/vitest')
}

afterEach(async () => {
  if (hasDom) {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  }
  vi.clearAllMocks()
  // Cached entries must not leak between tests — a stale hit from a previous
  // test's fixture is a confusing failure in an unrelated one.
  const { __resetNextCache } = await import('./mocks/next-cache')
  __resetNextCache()
})
