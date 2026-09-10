import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE PUBLIC SITE LOADS ITS PROFILE ONCE PER REQUEST, NOT TWICE.
 *
 * Next calls `generateMetadata` and the page body as separate invocations, so
 * an uncached async loader runs its queries for both. Every public clinic page
 * does exactly that with `getClinicSiteBySlug` — `app/site/[slug]/page.tsx:28`
 * and `:72` — which doubled the org + profile + locations reads on the
 * slowest, lowest-throughput surface in the product. `docs/LOAD-SANITY.md`:
 * `/site/[slug]` saturates at concurrency 8, and raising concurrency to 25
 * bought no throughput at all — flat throughput with latency rising in
 * proportion is a queue, and this is some of what was queueing.
 *
 * AND THE MEMOIZATION IS PER-REQUEST, WHICH IS THE WHOLE SAFETY ARGUMENT.
 *
 * `loadSite` merges a clinic's UNPUBLISHED draft over the live columns when
 * the viewer is a verified editor of that clinic. The loader's result
 * therefore depends on who is asking. React's `cache()` is scoped to one
 * request — where the session cannot change — so memoizing is safe. A durable
 * cache keyed on slug alone would not be: it would serve one viewer's render
 * to the next, and in the direction that matters that is a clinic's
 * unpublished words published on their own live site.
 *
 * WHAT THIS FILE ACTUALLY PROVES — the dedupe is not one of the two.
 *
 * `cache()` only memoizes inside a request scope, which Next establishes per
 * server-component render and a unit test does not have. Outside one it is a
 * pass-through, so "two calls, one query" cannot be asserted here; the first
 * draft of this file tried and failed for that reason rather than for a real
 * one. The dedupe is framework behaviour, taken on the same terms as the two
 * loaders above it that were already wrapped.
 *
 * What is checkable, and what matters more, is the SAFETY property: that the
 * draft is still decided per viewer. The last test is the one that fails if
 * someone swaps `cache()` for `unstable_cache` without first splitting the
 * published read out of `loadSite`.
 */

const state = {
  org: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  locations: [] as Record<string, unknown>[],
  canEdit: false,
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const nameOf = (t: unknown) => String((t as Record<symbol, unknown>)?.[Symbol.for('drizzle:Name')] ?? '')
  return {
    schema,
    db: {
      select: () => {
        let table = ''
        const chain: Record<string, unknown> = {}
        const rows = () => {
          if (table === 'organization') return state.org ? [state.org] : []
          if (table === 'clinic_profile') return state.profile ? [state.profile] : []
          if (table === 'clinic_location') return state.locations
          return []
        }
        chain.from = (t: unknown) => {
          table = nameOf(t)
          return chain
        }
        for (const m of ['where', 'orderBy', 'leftJoin', 'innerJoin']) chain[m] = () => chain
        chain.limit = async () => rows()
        chain.then = (resolve: (v: unknown) => void) => resolve(rows())
        return chain
      },
    },
  }
})

vi.mock('@/lib/clinic-site-edit', () => ({
  canEditClinic: vi.fn(async () => state.canEdit),
  resolveEditMode: vi.fn(async () => false),
}))

/**
 * A fresh module instance, standing in for a new request. Nothing here depends
 * on `cache()` memoizing — see the file header — but resetting modules keeps
 * each test's view of the loader independent, which is what makes the
 * editor-then-visitor test below a real sequence rather than one call.
 */
async function freshRequest(): Promise<typeof import('@/lib/services/clinic-site')> {
  vi.resetModules()
  return import('@/lib/services/clinic-site')
}

/** Source with comments blanked, so a scan reads code rather than prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

beforeEach(() => {
  state.org = { id: 'org_1', slug: 'smilebright', name: 'SmileBright', type: 'clinic' }
  state.profile = {
    organizationId: 'org_1',
    displayName: 'SmileBright Dental',
    tagline: 'Published tagline',
    websiteDraft: null,
  }
  state.locations = [{ id: 'loc_1', organizationId: 'org_1', isPrimary: 1 }]
  state.canEdit = false
})

describe('the loaders are the request-scoped kind', () => {
  /**
   * WHAT THIS CAN AND CANNOT PROVE.
   *
   * React's `cache()` only memoizes inside a request scope, which Next sets up
   * per server-component render. Outside one — which is where a unit test
   * lives — it is a pass-through, so the dedupe itself is NOT observable here
   * and a test asserting "two calls, one query" would fail for reasons that
   * have nothing to do with the change. I wrote that assertion first and it
   * failed exactly that way; it is gone rather than weakened.
   *
   * So this pins the part that IS checkable in a unit test — that both public
   * loaders go through `cache()` at all, which is the thing a refactor would
   * silently undo — and leaves the memoization itself to the framework, the
   * same way `getClinicOrgIdBySlug` and `getClinicThemeBySlug` above already
   * do. The behaviour that actually needs guarding is in the next block.
   */
  it('both public site loaders are cache()-wrapped, and NEITHER is durable', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/clinic-site.ts', 'utf8'),
    )
    expect(src).toMatch(/export const getClinicSiteBySlug = cache\(/)
    expect(src).toMatch(/export const getClinicSiteByDomain = cache\(/)

    // THE guard. `loadSite` merges a verified editor's unpublished draft, so a
    // cache that outlives the request would serve one viewer's render to the
    // next — a clinic's unpublished words on their live public site. No
    // behavioural test in this file can catch that swap (see the note on the
    // last test), so it is checked where the property actually lives.
    //
    // Making this durable is legitimate work — it is slice 2 — but only AFTER
    // the published read is split out of `loadSite` and the overlay applied
    // outside it. When that lands, this assertion moves to the split loader
    // rather than being deleted.
    // COMMENTS STRIPPED FIRST. The file's own doc comments discuss
    // `unstable_cache` at length — explaining exactly why it must not be used
    // here — so a raw scan flags the explanation as the offence. It did,
    // the first time the published read was split out. Code only.
    const code = stripComments(src)
    expect(
      code,
      'clinic-site.ts reached for a durable cache. The published read must be ' +
        'split out of loadSite and the overlay applied outside it, or a ' +
        'visitor gets the editor’s draft.',
    ).not.toMatch(/unstable_cache/)
  })

  it('still returns the right site per slug', async () => {
    const mod = await freshRequest()
    const first = await mod.getClinicSiteBySlug('smilebright')
    expect(first?.orgId).toBe('org_1')

    state.org = { id: 'org_2', slug: 'other', name: 'Other', type: 'clinic' }
    state.profile = { organizationId: 'org_2', displayName: 'Other Dental', websiteDraft: null }
    const second = await mod.getClinicSiteBySlug('other')
    expect(second?.orgId).toBe('org_2')
  })

  it('an unknown or non-clinic slug is still null', async () => {
    const mod = await freshRequest()
    state.org = { id: 'org_p', slug: 'dream-create', name: 'Dream Create', type: 'platform' }
    expect(await mod.getClinicSiteBySlug('dream-create')).toBeNull()
    state.org = null
    expect(await mod.getClinicSiteBySlug('nope')).toBeNull()
  })
})

describe('the published read is separable from the viewer', () => {
  /**
   * `loadPublishedSite` is module-private, so it cannot be called directly.
   * What IS observable is the property that makes it separable: the published
   * path reads no session at all. If a future edit reached for
   * `canEditClinic` (or anything else session-shaped) inside the published
   * read, this fails — and that matters because the whole safety case for
   * caching that half rests on it depending only on `orgId`.
   */
  it('never touches the session when there is no draft', async () => {
    const { canEditClinic } = await import('@/lib/clinic-site-edit')
    vi.mocked(canEditClinic).mockClear()

    const mod = await freshRequest()
    const site = await mod.getClinicSiteBySlug('smilebright')

    expect(site?.profile.tagline).toBe('Published tagline')
    expect(
      vi.mocked(canEditClinic),
      'the published read asked who the viewer is — it must not need to',
    ).not.toHaveBeenCalled()
  })

  it('asks exactly once when a draft exists', async () => {
    const { canEditClinic } = await import('@/lib/clinic-site-edit')
    vi.mocked(canEditClinic).mockClear()
    state.profile = { ...state.profile, websiteDraft: { tagline: 'draft' } }

    const mod = await freshRequest()
    await mod.getClinicSiteBySlug('smilebright')

    // One session lookup per load, not one per query on the published side.
    expect(vi.mocked(canEditClinic)).toHaveBeenCalledTimes(1)
  })
})

describe('the draft overlay is still decided per viewer', () => {
  const DRAFT = { tagline: 'UNPUBLISHED tagline' }

  it('a visitor gets the published tagline even though a draft exists', async () => {
    state.profile = { ...state.profile, websiteDraft: DRAFT }
    state.canEdit = false
    const mod = await freshRequest()
    const site = await mod.getClinicSiteBySlug('smilebright')
    expect(site?.profile.tagline).toBe('Published tagline')
  })

  it('a verified editor gets the draft merged over it', async () => {
    state.profile = { ...state.profile, websiteDraft: DRAFT }
    state.canEdit = true
    const mod = await freshRequest()
    const site = await mod.getClinicSiteBySlug('smilebright')
    expect(site?.profile.tagline).toBe('UNPUBLISHED tagline')
  })

  it('recomputes the overlay per viewer rather than baking it into the payload', async () => {
    // NOT a cross-request test, and an earlier version of this comment claimed
    // it was. `freshRequest()` calls `vi.resetModules()`, so each "request"
    // builds a brand-new wrapper with a virgin memo — of whatever kind. Swap
    // `cache()` for `unstable_cache` and this still passes, so it cannot
    // observe the swap it used to advertise. The `freshRequest` docstring said
    // as much; the two disagreed and the docstring was the honest half.
    //
    // What it does prove is worth having on its own terms: the same slug,
    // asked by two different viewers, yields two different answers — so the
    // overlay is a function of the session at read time and not something
    // frozen into the payload. The guard against the durable-cache swap is the
    // source assertion in the block above, which is where that property can
    // actually be checked.
    state.profile = { ...state.profile, websiteDraft: DRAFT }

    state.canEdit = true
    const editorReq = await freshRequest()
    const editorView = await editorReq.getClinicSiteBySlug('smilebright')
    expect(editorView?.profile.tagline).toBe('UNPUBLISHED tagline')

    state.canEdit = false
    const visitorReq = await freshRequest()
    const visitorView = await visitorReq.getClinicSiteBySlug('smilebright')
    expect(
      visitorView?.profile.tagline,
      'a visitor was served the render made for the editor — unpublished content is live',
    ).toBe('Published tagline')
  })
})
