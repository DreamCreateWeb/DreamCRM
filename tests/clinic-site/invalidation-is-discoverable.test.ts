import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A FAILED INVALIDATION MUST BE DISCOVERABLE.
 *
 * The first version of `invalidateClinicSite` wrapped its one call in a
 * blanket `catch {}` carrying a comment that asserted the benign case:
 *
 *     try { updateTag(tag) } catch { // Not in a Server Action. }
 *
 * Review's objection was structural rather than speculative: whatever the
 * primitive turned out to do, a genuine breakage would have been
 * byte-identical to the expected no-op — in every environment, forever. The
 * one call that delivers "Publish takes effect immediately" could have been
 * dead from the first deploy and nothing anywhere would have said so.
 *
 * Exactly one condition is benign: there is no request scope (a cron, the demo
 * re-seeder, a boot script), where Next throws E263 and the TTL is the honest
 * answer. Every other throw means a real call site is wrong AND that this
 * clinic's site is not being invalidated, so it has to surface.
 *
 * These tests drive the production function with a `next/cache` that throws on
 * command — the only way to observe which errors it eats.
 */

const nextCache = { willThrow: null as unknown }

vi.mock('next/cache', () => ({
  revalidateTag: (_tag: string, _profile?: unknown) => {
    if (nextCache.willThrow) throw nextCache.willThrow
  },
  unstable_cache: (fn: (...a: never[]) => unknown) => fn,
  revalidatePath: () => {},
  updateTag: () => {},
  refresh: () => {},
}))

vi.mock('@/lib/db', () => ({ db: { select: () => ({}) } }))

function nextError(code: string, message: string): Error {
  return Object.assign(new Error(message), { __NEXT_ERROR_CODE: code })
}

beforeEach(() => {
  nextCache.willThrow = null
})

describe('invalidateClinicSite', () => {
  it('stays quiet when there is simply no request scope', async () => {
    const { invalidateClinicSite } = await import('@/lib/services/clinic-site-cache')
    nextCache.willThrow = nextError('E263', 'Invariant: static generation store missing in ...')

    // A cron writing a clinic_profile row must not blow up because it has
    // nothing to revalidate against. The TTL covers this case by design.
    expect(() => invalidateClinicSite('org_1')).not.toThrow()
  })

  it('surfaces anything else, rather than pretending it was that', async () => {
    const { invalidateClinicSite } = await import('@/lib/services/clinic-site-cache')

    // Each of these is a real bug in a call site, and each one silently means
    // the clinic's published site is not being dropped. Codes are Next's own.
    const realBugs: Array<[string, string]> = [
      ['E7', 'used "revalidateTag" during render which is unsupported'],
      ['E181', 'used "revalidateTag" inside a "use cache" which is unsupported'],
      ['E306', 'used "revalidateTag" inside a function cached with "unstable_cache(...)"'],
      ['E1127', 'used "revalidateTag" inside `generateStaticParams`'],
    ]

    for (const [code, message] of realBugs) {
      nextCache.willThrow = nextError(code, message)
      expect(
        () => invalidateClinicSite('org_1'),
        `${code} was swallowed. That is a broken call site AND a clinic whose\n` +
          `site is never invalidated, and nothing would ever report it.`,
      ).toThrow(message)
    }
  })

  it('surfaces an error with no Next code at all', async () => {
    const { invalidateClinicSite } = await import('@/lib/services/clinic-site-cache')
    // The catch narrows on a code; something unexpected has none, and
    // "unrecognised" must not collapse into "benign".
    nextCache.willThrow = new TypeError('revalidateTag is not a function')
    expect(() => invalidateClinicSite('org_1')).toThrow(/not a function/)
  })

  it('does the same for the slug-keyed theme tag', async () => {
    const { invalidateClinicSiteBySlug } = await import('@/lib/services/clinic-site-cache')

    nextCache.willThrow = nextError('E263', 'Invariant: static generation store missing in ...')
    expect(() => invalidateClinicSiteBySlug('smilebright')).not.toThrow()

    nextCache.willThrow = nextError('E7', 'used during render')
    expect(
      () => invalidateClinicSiteBySlug('smilebright'),
      'the two tags go through one helper; if only one narrows, they have drifted',
    ).toThrow(/during render/)
  })
})
