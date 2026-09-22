import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * NEXT'S ASYNC-LOCAL STORES NEED A REAL `AsyncLocalStorage`, AND THE SUITE
 * RUNS IN happy-dom, WHERE THERE ISN'T ONE.
 *
 * `next/dist/server/app-render/async-local-storage.js` reads
 * `globalThis.AsyncLocalStorage` ONCE at module evaluation and falls back to a
 * `FakeAsyncLocalStorage` whose `run()` throws `Invariant: AsyncLocalStorage
 * accessed in runtime where it is not available` (E504). That fake is why the
 * render-phase tests below could not drive the real `revalidate()` at first —
 * they were measuring the shim, not the guard clause they are about.
 *
 * Installed at module scope, BEFORE any test dynamically imports `next/cache`
 * or the `*.external` store modules, because the capture is at evaluation
 * time. `??=` so a runtime that already provides one keeps its own.
 */
;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage

/**
 * A LOCAL `next/cache` double that can be made to throw a chosen error.
 *
 * The suite-wide double (`tests/mocks/next-cache.ts`) exports plain functions,
 * so there is nothing to `spyOn`. This wraps it: everything behaves exactly as
 * the shared double does, except that `revalidateTag` first rethrows whatever
 * `nextCacheThrows` holds. That is how the last test feeds our production
 * catch the REAL error object Next produced in the first test, rather than a
 * hand-built lookalike whose `__NEXT_ERROR_CODE` we chose ourselves.
 */
let nextCacheThrows: unknown = null
vi.mock('next/cache', async () => {
  const shared = await import('../mocks/next-cache')
  return {
    ...shared,
    revalidateTag: (tag: string, profile?: string | { expire?: number }) => {
      if (nextCacheThrows) throw nextCacheThrows
      return shared.revalidateTag(tag, profile)
    },
  }
})

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

  /**
   * THE RENDER PHASE, DRIVEN FOR REAL — the case a source-text test cannot see.
   *
   * PR #654 wired `invalidateClinicSiteForOrg` into
   * `syncSubscriptionFromStripe`, having reasoned about that function as the
   * Stripe webhook handler. It has a second caller that is not a webhook:
   * `app/(default)/settings/billing/page.tsx` calls it in its Server Component
   * BODY, via `syncCheckoutSuccess`, on the `?checkout=success` landing.
   *
   * `revalidateTag` throws there. The suite "covered" that invalidation by
   * grepping `billing.ts` for the function's NAME — which was present, and
   * threw. A name-scan cannot see the phase a call runs in, so this drives the
   * real `revalidate()` through Next's own async-local stores and asserts the
   * code our catch narrows on.
   *
   * The consequence was not a missed invalidation. The throw landed between
   * the profile write and `enforceSocialConnectionCap`, so a clinic dropping
   * from the full-Premium trial to a smaller plan KEPT social connections the
   * platform pays for. Caught by Sentinel in review.
   */
  describe('the render phase', () => {
    /**
     * The two async-local stores `revalidate()` reads. Imported from Next's
     * own `*.external` entrypoints — the same modules the framework uses, so
     * these are the real stores rather than a model of them.
     */
    async function stores() {
      const [{ workAsyncStorage }, { workUnitAsyncStorage }] = await Promise.all([
        vi.importActual<typeof import('next/dist/server/app-render/work-async-storage.external')>(
          'next/dist/server/app-render/work-async-storage.external',
        ),
        vi.importActual<
          typeof import('next/dist/server/app-render/work-unit-async-storage.external')
        >('next/dist/server/app-render/work-unit-async-storage.external'),
      ])
      return { workAsyncStorage, workUnitAsyncStorage }
    }

    /** A work store shaped like the billing page's request. `incrementalCache`
     *  has to be present or `revalidate()` bails with E263 first and the test
     *  would be measuring the wrong guard clause. */
    const workStore = () =>
      ({
        route: '/settings/billing',
        page: '/settings/billing/page',
        incrementalCache: {},
      }) as unknown as Parameters<
        Awaited<ReturnType<typeof stores>>['workAsyncStorage']['run']
      >[0]

    async function revalidateInPhase(phase: 'render' | 'action'): Promise<unknown> {
      const { revalidateTag } = await vi.importActual<typeof import('next/cache')>(NEXT_CACHE)
      const { workAsyncStorage, workUnitAsyncStorage } = await stores()
      const unit = { type: 'request', phase } as unknown as Parameters<
        typeof workUnitAsyncStorage.run
      >[0]
      try {
        workAsyncStorage.run(workStore(), () =>
          workUnitAsyncStorage.run(unit, () =>
            revalidateTag('clinic-site:org_1', { expire: 0 }),
          ),
        )
        return null
      } catch (err) {
        return err
      }
    }

    it('revalidateTag THROWS during render, with the code we narrow on', async () => {
      const thrown = await revalidateInPhase('render')

      expect(
        thrown,
        'revalidateTag no longer throws during render. If Next made this legal,\n' +
          'the render-tolerant invalidator is dead weight — but check before\n' +
          'deleting it, because the failure it prevents is a truncated billing sync.',
      ).not.toBeNull()
      expect(
        (thrown as { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE,
        'the render-phase error code changed — RENDER_PHASE in\n' +
          'lib/services/clinic-site-cache.ts no longer matches it, so\n' +
          'invalidateClinicSiteForOrgUnlessRendering will rethrow and truncate\n' +
          'syncSubscriptionFromStripe on the checkout-success landing.',
      ).toBe('E7')
      expect(String((thrown as Error).message)).toMatch(/during render which is unsupported/)
    })

    it('and does NOT throw in the action phase — the control', async () => {
      // Without this, the test above would pass just as happily if
      // `revalidateTag` had started throwing unconditionally, which would mean
      // every writer in the app was silently failing.
      expect(
        await revalidateInPhase('action'),
        'revalidateTag threw in the ACTION phase too — this is no longer a\n' +
          'statement about rendering, it is a statement about the call being\n' +
          'broken everywhere.',
      ).toBeNull()
    })

    it('the tolerant invalidator swallows it and the strict one does not', async () => {
      // THE REAL ERROR OBJECT, not a lookalike. Built by Next's own
      // `revalidate()` in the test above, then handed to our production catch
      // — so if Next changes the code, the message, or the shape of what it
      // throws, this fails instead of quietly asserting against our own
      // idea of that error.
      const real = await revalidateInPhase('render')
      expect(real, 'no error to feed the catch — the test above must run first').not.toBeNull()

      const { invalidateClinicSite, invalidateClinicSiteForOrgUnlessRendering } = await import(
        '@/lib/services/clinic-site-cache'
      )

      nextCacheThrows = real
      try {
        expect(
          () => invalidateClinicSite('org_1'),
          'the STRICT invalidator stopped rethrowing a render-phase refusal —\n' +
            'the signal that a new render-reachable call site is a bug is gone',
        ).toThrow(/during render/)

        await expect(
          invalidateClinicSiteForOrgUnlessRendering('org_1'),
          'the render-TOLERANT invalidator threw during render. This is the\n' +
            'defect from #654: the throw propagates into\n' +
            'syncSubscriptionFromStripe and truncates it before the over-cap\n' +
            'social enforcement runs, so a clinic leaving the full-Premium\n' +
            'trial keeps social connections the platform pays for.',
        ).resolves.toBeUndefined()
      } finally {
        nextCacheThrows = null
      }
    })

    it('the tolerance is narrow — any OTHER refusal still surfaces', async () => {
      // Without this, "tolerant" could quietly have become "blanket catch",
      // which is the pattern this module's own doc comment exists to forbid.
      // E181 is `revalidateTag` inside a `'use cache'` — a real bug that must
      // never be swallowed by either variant.
      const { invalidateClinicSiteForOrgUnlessRendering } = await import(
        '@/lib/services/clinic-site-cache'
      )
      nextCacheThrows = Object.assign(new Error('used inside a "use cache"'), {
        __NEXT_ERROR_CODE: 'E181',
      })
      try {
        await expect(
          invalidateClinicSiteForOrgUnlessRendering('org_1'),
          'the render-tolerant invalidator swallowed a NON-render refusal — it\n' +
            'has become the blanket catch this module was written to avoid',
        ).rejects.toThrow(/use cache/)
      } finally {
        nextCacheThrows = null
      }
    })
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
