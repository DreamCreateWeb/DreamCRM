import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

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
 * draft is still decided per viewer, in BOTH loaders on this path — the site
 * payload and the theme. The guard against a durable swap is the source
 * assertion in the first block; the behavioural tests below prove the overlay
 * is a function of the viewer rather than something baked into the payload.
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

/**
 * REQUEST STATE IS A LANDMINE, SO MAKE IT ONE.
 *
 * The published loaders must depend on the database and nothing else — that is
 * the whole basis for caching them across requests. Asserting "it didn't call
 * `canEditClinic`" only covers the one door I already knew about. Making
 * `headers()` and `cookies()` THROW covers the doors I haven't thought of: any
 * published path that reaches for request state now fails loudly instead of
 * quietly working in a test that has no request.
 */
vi.mock('next/headers', () => ({
  headers: () => {
    throw new Error('the published read touched headers() — it must read only the database')
  },
  cookies: () => {
    throw new Error('the published read touched cookies() — it must read only the database')
  },
}))

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

/** Every `.ts` file under a directory, as repo-relative paths. */
function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) walkTs(full, out)
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
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
  it('both public site loaders are cache()-wrapped', async () => {
    const src = readFileSync('lib/services/clinic-site.ts', 'utf8')
    expect(src).toMatch(/export const getClinicSiteBySlug = cache\(/)
    expect(src).toMatch(/export const getClinicSiteByDomain = cache\(/)
  })

  /**
   * NO MODULE ON THE PUBLIC READ PATH HOLDS A DURABLE CACHE.
   *
   * The first version of this read ONE file — the loader I had just split —
   * so the stop sign stood in front of the safest of the three and not the
   * most dangerous. `lib/site-templates/resolve.ts` had zero coverage, and
   * caching it would serve one owner's template preview as the live design
   * for every visitor to that clinic.
   *
   * So the set is DERIVED rather than listed: every module under `lib/` that
   * consumes `canEditClinic` is by definition viewer-dependent, and none of
   * them may outlive the request. A fourth loader added tomorrow is covered
   * the moment it reaches for the session — which is the property that made
   * my last hand-written note incomplete.
   */
  it('no viewer-dependent module under lib/ reaches for a durable cache', () => {
    const viewerDependent = walkTs('lib')
      .filter((f) => f !== 'lib/clinic-site-edit.ts') // the definition, not a consumer
      .filter((f) => /\bcanEditClinic\b/.test(readFileSync(f, 'utf8')))

    // A derived set that comes back empty passes forever.
    expect(viewerDependent.length, 'the scan found no canEditClinic consumers').toBeGreaterThan(0)
    expect(viewerDependent).toContain('lib/services/clinic-site.ts')
    expect(viewerDependent).toContain('lib/site-templates/resolve.ts')

    // COMMENTS STRIPPED. These files discuss `unstable_cache` at length —
    // explaining precisely why it must not be used — so a raw scan reads the
    // explanation as the offence. It did, the first time the published read
    // was split out.
    const offenders = viewerDependent.filter((f) =>
      /unstable_cache/.test(stripComments(readFileSync(f, 'utf8'))),
    )
    expect(
      offenders,
      `These read the session and therefore differ per viewer, so a cache that\n` +
        `outlives the request serves one viewer's answer to the next — a clinic's\n` +
        `unpublished content, colour or design on their live public site.\n` +
        `Split the published half out FIRST (loadPublishedSite / loadPublishedTheme\n` +
        `are the worked examples), or — for resolve.ts — accept that there is no\n` +
        `published half and it stays per-request:\n${offenders.join('\n')}`,
    ).toEqual([])
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

describe('the theme loader is split the same way', () => {
  /**
   * `getClinicThemeBySlug` carried the identical Draft->Publish overlay and
   * was NOT split by the first pass — the review caught it. It matters more
   * than its size suggests: `app/site/[slug]/layout.tsx` calls it on every
   * public clinic page, and `lib/site-templates/resolve.ts` uses it to choose
   * which template renders the site. Caching it as it stood would have put a
   * clinic's unpublished brand colour and design on their live public site.
   */
  const THEMED = {
    id: 'org_1',
    slug: 'smilebright',
    name: 'SmileBright',
    type: 'clinic',
    brandColor: '#0d9488',
    template: 'modern',
    websiteDraft: null as unknown,
  }

  it('a visitor gets the published brand and template', async () => {
    state.org = { ...THEMED, websiteDraft: { brandColor: '#ff0000', template: 'cosmetic' } }
    state.canEdit = false
    const mod = await freshRequest()
    const theme = await mod.getClinicThemeBySlug('smilebright')
    expect(theme.brand).toBe('#0d9488')
    expect(theme.template).toBe('modern')
    expect(theme.hasEditorDraft).toBe(false)
  })

  it('a verified editor gets the staged brand and template', async () => {
    state.org = { ...THEMED, websiteDraft: { brandColor: '#ff0000', template: 'cosmetic' } }
    state.canEdit = true
    const mod = await freshRequest()
    const theme = await mod.getClinicThemeBySlug('smilebright')
    expect(theme.brand).toBe('#ff0000')
    expect(theme.template).toBe('cosmetic')
    expect(theme.hasEditorDraft).toBe(true)
  })

  it('a draft that stages only the colour leaves the template published', async () => {
    // The overlay is per-KEY, not all-or-nothing — a partial draft must not
    // blank the design the clinic is actually serving.
    state.org = { ...THEMED, websiteDraft: { brandColor: '#ff0000' } }
    state.canEdit = true
    const mod = await freshRequest()
    const theme = await mod.getClinicThemeBySlug('smilebright')
    expect(theme.brand).toBe('#ff0000')
    expect(theme.template).toBe('modern')
  })

  it('a CLEARED field reads as cleared, not as the published value', async () => {
    // The subtle half of `mergeWebsiteDraft`'s rule is `value ?? null`: a key
    // the clinic explicitly emptied in their draft must come back empty, not
    // fall back to what is published. The theme overlay used to open-code
    // that, so there were two homes for one rule — and the failure that buys
    // is a preview where the colour obeys one rule and the tagline the other.
    // The overlay routes through `mergeWebsiteDraft` now; this pins the
    // behaviour so a future re-inlining fails here.
    state.org = { ...THEMED, websiteDraft: { brandColor: null } }
    state.canEdit = true
    const mod = await freshRequest()
    const theme = await mod.getClinicThemeBySlug('smilebright')
    expect(theme.brand, 'a cleared brand colour fell back to the published one').toBeNull()
    expect(theme.template).toBe('modern')
    expect(theme.hasEditorDraft).toBe(true)
  })

  it('never touches the session when there is no draft', async () => {
    const { canEditClinic } = await import('@/lib/clinic-site-edit')
    vi.mocked(canEditClinic).mockClear()
    state.org = { ...THEMED }

    const mod = await freshRequest()
    const theme = await mod.getClinicThemeBySlug('smilebright')

    expect(theme.brand).toBe('#0d9488')
    expect(
      vi.mocked(canEditClinic),
      'the published theme read asked who the viewer is — it must not need to',
    ).not.toHaveBeenCalled()
  })

  it('an unknown or non-clinic slug is all-null, not a crash', async () => {
    const mod = await freshRequest()
    state.org = { ...THEMED, type: 'platform' }
    expect((await mod.getClinicThemeBySlug('dream-create')).orgId).toBeNull()
    state.org = null
    expect((await mod.getClinicThemeBySlug('nope')).orgId).toBeNull()
  })
})
