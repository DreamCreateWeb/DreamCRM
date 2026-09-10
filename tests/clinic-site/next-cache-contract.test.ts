import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * WHAT NEXT ACTUALLY DOES — asserted against the installed Next, not our double.
 *
 * Every other test of the cache boundary runs against
 * `tests/mocks/next-cache.ts`, which is our MODEL of Next's behaviour. That
 * model is honest about serialization (it round-trips a hit through JSON, which
 * is the whole reason the revival tests mean anything), but a model can only
 * ever confirm itself. Review made the point precisely: the invalidation tests
 * proved our `updateTag` drops tagged entries, because we wrote an `updateTag`
 * that drops tagged entries.
 *
 * So this file deliberately bypasses the suite-wide mock via `importActual` and
 * pins the parts of the real contract that `lib/services/clinic-site-cache.ts`
 * depends on. If a Next upgrade moves any of them, this fails here — loudly,
 * in one place — rather than silently turning Publish into a no-op.
 *
 * THE QUESTION THAT PROMPTED IT. The first version of the cache paired
 * `updateTag` (the Cache Components partner to `'use cache'`) with
 * `unstable_cache` (the legacy Data Cache), while `next.config.js` enables
 * neither `cacheComponents` nor `dynamicIO`. Reasonable challenge: does that
 * pairing invalidate anything at all? Reading Next 16.2.10's own source, both
 * primitives converge:
 *
 *   revalidateTag(tag, profile) ─┐
 *   updateTag(tag) ──────────────┴─> revalidate(tags, expr, profile)
 *        -> workStore.pendingRevalidatedTags
 *        -> executeRevalidates -> revalidateTags()
 *        -> incrementalCache.revalidateTag(tags, durations)
 *
 * and `unstable_cache` writes through `incrementalCache.set(key, { ..., tags })`
 * on that same incremental cache. So the pairing worked — Cache Components
 * being off only no-ops the separate `getCacheHandlers()` loop.
 *
 * We still moved to `revalidateTag`, for a reason the investigation surfaced
 * rather than the one that was suspected: `updateTag` THROWS outside a Server
 * Action, and these writers are reachable from route handlers and crons too.
 */

const NEXT_CACHE = 'next/cache'

describe('the real next/cache, unmocked', () => {
  it('revalidateTag rejects a call with no request scope, with the code we catch on', async () => {
    const { revalidateTag } = await vi.importActual<typeof import('next/cache')>(NEXT_CACHE)

    // No work store here — the same situation as a cron or a boot script.
    let thrown: unknown
    try {
      revalidateTag('clinic-site:org_1', { expire: 0 })
    } catch (err) {
      thrown = err
    }

    expect(thrown, 'revalidateTag no longer throws outside a request scope').toBeDefined()
    expect(
      (thrown as { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE,
      'the error code our catch narrows on has changed — invalidateTag() in\n' +
        'lib/services/clinic-site-cache.ts will now rethrow on crons (turning a\n' +
        'successful save into an error) or swallow a real bug. Re-read Next\'s\n' +
        'revalidate() and update NO_REQUEST_SCOPE.',
    ).toBe('E263')
  })

  it('updateTag refuses outside a Server Action — the reason we do not use it', async () => {
    const { updateTag } = await vi.importActual<typeof import('next/cache')>(NEXT_CACHE)

    let thrown: unknown
    try {
      updateTag('clinic-site:org_1')
    } catch (err) {
      thrown = err
    }

    expect(thrown, 'updateTag no longer refuses outside a Server Action').toBeDefined()
    // A DIFFERENT code from the one above, which is the point: had we kept
    // `updateTag` behind the old blanket catch, every route-handler and cron
    // call site would have silently skipped invalidation forever.
    expect((thrown as { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE).toBe('E872')
    expect(String((thrown as Error).message)).toMatch(/only be called from within a Server Action/)
  })

  /**
   * A SOURCE CANARY, and labelled as one.
   *
   * The behavioural assertions above can only reach the guard clauses — driving
   * a real tag through to a real cache handler needs a running Next server,
   * which a unit test does not have. So the remaining link in the chain (that
   * tag revalidation reaches the same incremental cache `unstable_cache`
   * writes) is pinned by reading Next's shipped source.
   *
   * This is a weaker instrument than a behavioural test and is here because the
   * alternative was an assumption in a comment. It will fail on a Next upgrade
   * that restructures these files, which is the intent: at that point somebody
   * re-reads the chain rather than discovering it through a clinic reporting
   * that Publish does nothing.
   */
  it('tag revalidation still reaches the cache unstable_cache writes to', () => {
    const revalidateSrc = readFileSync(
      'node_modules/next/dist/server/revalidation-utils.js',
      'utf8',
    )
    const unstableSrc = readFileSync(
      'node_modules/next/dist/server/web/spec-extension/unstable-cache.js',
      'utf8',
    )

    // The write side: unstable_cache stores entries, with tags, on the
    // incremental cache.
    expect(
      unstableSrc,
      'unstable_cache no longer writes through incrementalCache.set — re-read the chain',
    ).toMatch(/incrementalCache\.set\(/)

    // The invalidation side: revalidating tags reaches that same cache.
    expect(
      revalidateSrc,
      'tag revalidation no longer calls incrementalCache.revalidateTag — a publish\n' +
        'may no longer drop the cached clinic site. Re-read Next\'s revalidation-utils.',
    ).toMatch(/incrementalCache\.revalidateTag\(/)
  })
})
