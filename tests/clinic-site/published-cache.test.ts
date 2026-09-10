import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { readFileSync } from 'node:fs'

/**
 * THE CACHE BOUNDARY: WHAT SURVIVES A ROUND TRIP, AND WHAT MUST NOT CROSS IT.
 *
 * `lib/services/clinic-site-cache.ts` is the only durable cache on the public
 * clinic-site path. Two properties make it safe and one makes it correct:
 *
 *   SAFE   — the module cannot read the session, so it cannot cache a
 *            viewer-dependent answer (asserted structurally, below);
 *          — the clinic's unpublished draft never enters it.
 *   CORRECT— a cache HIT and a cache MISS produce the same payload.
 *
 * That last one is not a tidiness property. `unstable_cache` persists through
 * JSON, so a hit returns strings where a miss returned `Date`s — while the
 * TypeScript signature claims `Date` on both. The suite's `next/cache` double
 * (`tests/mocks/next-cache.ts`) reproduces exactly that asymmetry, which is
 * what lets these tests observe it at all; a pass-through double would make
 * every assertion here vacuous.
 */

const state = {
  org: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  locations: [] as Record<string, unknown>[],
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

const TRIAL_ENDS = new Date('2026-09-15T12:34:56.000Z')
const SITE_LIVE = new Date('2026-09-01T08:00:00.000Z')
const CREATED = new Date('2026-08-01T00:00:00.000Z')

beforeEach(() => {
  state.org = { id: 'org_1', slug: 'smilebright', name: 'SmileBright', type: 'clinic' }
  state.profile = {
    organizationId: 'org_1',
    displayName: 'SmileBright Dental',
    tagline: 'Published tagline',
    websiteDraft: null,
    trialEndsAt: TRIAL_ENDS,
    siteLiveAt: SITE_LIVE,
    createdAt: CREATED,
    updatedAt: CREATED,
    subscriptionStatus: null,
    stripeSubscriptionId: null,
  }
  // TWO locations, deliberately: a one-element array is already sorted and
  // already reversed, so `sort()`/`reverse()` write nothing and slide past a
  // freeze without tripping it. The first version of the freeze test used a
  // single location and passed for that reason rather than a real one.
  state.locations = [
    { id: 'loc_1', organizationId: 'org_1', isPrimary: 1, createdAt: CREATED },
    { id: 'loc_2', organizationId: 'org_1', isPrimary: 0, createdAt: CREATED },
  ]
})

describe('a cache hit and a cache miss agree', () => {
  it('the whole payload is structurally identical on both paths', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')

    const miss = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    const hit = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')

    // The double only stores on a miss, so these really are the two paths.
    expect(miss).not.toBeNull()
    expect(
      hit,
      'the cached payload differs from the freshly-read one — every consumer\n' +
        'sees one shape on the first request after a deploy and another forever\n' +
        'after, which is the hardest kind of bug to reproduce',
    ).toEqual(miss)
  })

  it('EVERY timestamp column comes back a Date, derived from the schema', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')
    const { clinicProfile } = await import('@/lib/db/schema/platform')

    // Derived, not listed: a 15th timestamp column added tomorrow is covered.
    const stamps = Object.entries(getTableColumns(clinicProfile))
      .filter(([, c]) => (c as unknown as { dataType: string }).dataType === 'date')
      .map(([k]) => k)
    expect(stamps.length, 'the schema scan found no timestamp columns').toBeGreaterThan(0)

    await loadPublishedSite('org_1', 'smilebright', 'SmileBright') // miss
    const hit = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')

    const profile = hit!.profile as unknown as Record<string, unknown>
    for (const key of stamps) {
      const value = profile[key]
      if (value == null) continue
      expect(value, `${key} came back from the cache as a ${typeof value}, not a Date`).toBeInstanceOf(
        Date,
      )
    }
    expect(hit!.locations[0]!.createdAt).toBeInstanceOf(Date)
    expect(hit!.primaryLocation!.createdAt).toBeInstanceOf(Date)
  })

  it('the timestamp VALUES survive the round trip exactly', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')
    await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    const hit = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    // Not merely "a Date" — the SAME instant. A revival that read the string
    // in the host's zone instead of UTC would pass the type check above and
    // still move a clinic's trial wall by hours.
    expect(hit!.profile.trialEndsAt!.getTime()).toBe(TRIAL_ENDS.getTime())
    expect(hit!.profile.siteLiveAt!.getTime()).toBe(SITE_LIVE.getTime())
  })

  /**
   * THE REGRESSION THIS SLICE EXISTS TO PREVENT.
   *
   * `resolveTrialState` does `input.trialEndsAt.getTime()`, which is a
   * TypeError on a string rather than a wrong answer. Its two early returns
   * (a paid subscription, or no trial at all) mean the crash lands on exactly
   * one cohort — clinics INSIDE their 7-day trial — and the callers are
   * `app/site/[slug]/robots.txt/route.ts` and `sitemap.xml/route.ts`, both of
   * which run it on this payload. Without the revival, a brand-new customer's
   * site starts 500ing its robots and sitemap on the SECOND request.
   */
  it('resolveTrialState still works on a cached payload', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')
    const { resolveTrialState } = await import('@/lib/trial')

    await loadPublishedSite('org_1', 'smilebright', 'SmileBright') // miss
    const hit = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')

    const now = new Date('2026-09-13T00:00:00.000Z')
    expect(() => resolveTrialState(hit!.profile, now)).not.toThrow()
    const trial = resolveTrialState(hit!.profile, now)
    expect(trial.onTrial).toBe(true)
    expect(trial.expired).toBe(false)
  })
})

describe('the unpublished draft never enters the cache', () => {
  it('is stripped from the payload even when the clinic has one', async () => {
    state.profile = { ...state.profile, websiteDraft: { tagline: 'UNPUBLISHED' } }
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')

    const site = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')

    expect(site!.hasWebsiteDraft, 'the clinic-level fact is cacheable and must survive').toBe(true)
    expect(
      site!.profile.websiteDraft,
      "a clinic's unpublished words are sitting in a cache shared across viewers",
    ).toBeNull()
    // And nothing of the draft leaked in by another route.
    expect(JSON.stringify(site)).not.toContain('UNPUBLISHED')
  })

  it('reports no draft when there is none', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')
    const site = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    expect(site!.hasWebsiteDraft).toBe(false)
  })
})

describe('the payload cannot be mutated', () => {
  it('is frozen, so an in-place edit throws instead of corrupting the next request', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')
    const site = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')

    // The exact mistake the doc comment has warned about since the split: a
    // caller mutating the shared array in place. Now it is a throw, not a
    // silent reorder of somebody else's page.
    //
    // `push`, not `sort()` — a single-element array is already sorted, so
    // `sort()` writes nothing and never trips the freeze. The first version of
    // this assertion used it and passed for that reason rather than a real one.
    expect(() => site!.locations.push(site!.locations[0]!)).toThrow()
    expect(() => site!.locations.reverse()).toThrow()
    expect(() => {
      ;(site!.profile as unknown as Record<string, unknown>).tagline = 'hacked'
    }).toThrow()
    expect(site!.profile.tagline).toBe('Published tagline')
  })
})

describe('the cache key covers everything baked into the payload', () => {
  it('a renamed clinic is not served its old name', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')

    const before = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    expect(before!.orgName).toBe('SmileBright')

    // Same org, new display name. `orgName` and `slug` are arguments that end
    // up IN the payload, so keying on orgId alone would serve the stale name
    // until the TTL expired.
    const after = await loadPublishedSite('org_1', 'smilebright', 'SmileBright Dental Care')
    expect(
      after!.orgName,
      'the cache key ignores orgName, so a renamed clinic keeps its old name',
    ).toBe('SmileBright Dental Care')
  })

  it('two clinics never share an entry', async () => {
    const { loadPublishedSite } = await import('@/lib/services/clinic-site-cache')
    const first = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    expect(first!.orgId).toBe('org_1')

    state.org = { id: 'org_2', slug: 'other', name: 'Other', type: 'clinic' }
    state.profile = { organizationId: 'org_2', displayName: 'Other Dental', websiteDraft: null }
    const second = await loadPublishedSite('org_2', 'other', 'Other')
    expect(second!.orgId, 'one clinic was served another clinic\'s site').toBe('org_2')
  })
})

describe('invalidation drops the entry', () => {
  it('a publish makes the next read go back to the database', async () => {
    const { loadPublishedSite, invalidateClinicSite } = await import(
      '@/lib/services/clinic-site-cache'
    )

    const first = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    expect(first!.profile.tagline).toBe('Published tagline')

    // The clinic publishes an edit...
    state.profile = { ...state.profile, tagline: 'Newly published' }

    // ...without invalidation the cache still answers with the old words.
    const stale = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    expect(stale!.profile.tagline).toBe('Published tagline')

    invalidateClinicSite('org_1')

    const fresh = await loadPublishedSite('org_1', 'smilebright', 'SmileBright')
    expect(
      fresh!.profile.tagline,
      'the tag did not drop this clinic\'s entry — a publish would appear to do nothing',
    ).toBe('Newly published')
  })

  it('invalidating one clinic leaves another clinic cached', async () => {
    const { loadPublishedSite, invalidateClinicSite } = await import(
      '@/lib/services/clinic-site-cache'
    )
    await loadPublishedSite('org_1', 'smilebright', 'SmileBright')

    state.org = { id: 'org_2', slug: 'other', name: 'Other', type: 'clinic' }
    state.profile = { organizationId: 'org_2', displayName: 'Other', tagline: 'Theirs', websiteDraft: null }
    await loadPublishedSite('org_2', 'other', 'Other')

    // org_2's row changes underneath, but only org_1 is invalidated.
    state.profile = { ...state.profile, tagline: 'Changed' }
    invalidateClinicSite('org_1')

    const other = await loadPublishedSite('org_2', 'other', 'Other')
    expect(
      other!.profile.tagline,
      'one clinic publishing evicted every other clinic — the tag is not per-clinic',
    ).toBe('Theirs')
  })
})

/**
 * THE SAFETY PROPERTY, ASSERTED STRUCTURALLY.
 *
 * The module's own doc comment claims "nothing here can see the session,
 * because nothing here imports anything that can". A claim like that is worth
 * exactly as much as the test behind it — the guard in
 * `site-load-dedupe.test.ts` derives viewer-dependent modules and forbids them
 * a durable cache, and this is the mirror: the module that HOLDS the cache is
 * forbidden the viewer.
 */
describe('the cache module cannot see the viewer', () => {
  it('imports nothing session- or request-scoped', () => {
    const src = readFileSync('lib/services/clinic-site-cache.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

    for (const [what, re] of [
      ['the session', /\bcanEditClinic\b/],
      ['request transport', /from ['"]next\/headers['"]/],
      ['the tenant resolver', /\bgetTenantContext\b/],
      ['the overlay module', /from ['"]@\/lib\/services\/clinic-site['"]/],
    ] as Array<[string, RegExp]>) {
      expect(
        re.test(src),
        `the cache module reached for ${what}. Everything in this file is stored\n` +
          `across requests, so anything viewer-dependent here is served to the\n` +
          `next visitor — a clinic's unpublished content on their live site.`,
      ).toBe(false)
    }
  })
})
