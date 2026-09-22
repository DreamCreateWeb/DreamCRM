import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prewarm } from '../prewarm'
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

// Load the module(s) under test during COLLECTION, so no single test is
// billed for the cold module graph (see tests/prewarm.ts).
prewarm(
  () => import('@/lib/services/clinic-site-cache'),
  () => import('@/lib/db/schema/platform'),
  () => import('@/lib/trial'),
)

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
 * THE LAYOUT'S CHROME CROSSES THE SAME BOUNDARY, AND CARRIES THE SAME
 * LANDMINE.
 *
 * `app/site/[slug]/layout.tsx` used to run its own `clinic_profile` select on
 * every public page. Those eleven columns now ride the cached THEME payload,
 * which until this slice held nothing but strings and booleans — so it needed
 * no timestamp revival and had none.
 *
 * `trialEndsAt` and `siteLiveAt` change that. `resolveTrialState` calls
 * `.getTime()` on the first, and the layout hands it the chrome on EVERY
 * public page — so an unrevived string is not a wrong answer, it is a
 * TypeError on every page of a clinic's site, from the second request after a
 * deploy, for exactly the cohort inside their 7-day trial. That is the same
 * defect the site payload was already guarded against, arriving by a second
 * door.
 */
describe('the layout chrome survives the round trip', () => {
  /** The theme read joins FROM `organization`, so the mock serves the whole
   *  joined row from `state.org` — chrome columns included. */
  const THEME_ROW = {
    id: 'org_1',
    slug: 'smilebright',
    name: 'SmileBright',
    type: 'clinic',
    brandColor: '#0d9488',
    template: 'modern',
    websiteDraft: null as unknown,
    profileOrgId: 'org_1',
    displayName: 'SmileBright Dental',
    phone: '555-0100',
    logoUrl: 'https://cdn.example/logo.png',
    timezone: 'America/Chicago',
    announcement: { message: 'Closed Friday' },
    chatWidgetEnabled: true,
    hidePoweredBy: false,
    siteLiveAt: SITE_LIVE,
    trialEndsAt: TRIAL_ENDS,
    subscriptionStatus: null,
    stripeSubscriptionId: null,
  }

  beforeEach(() => {
    state.org = { ...THEME_ROW }
  })

  it('a hit and a miss agree on the whole theme payload', async () => {
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    const miss = await loadPublishedTheme('smilebright')
    const hit = await loadPublishedTheme('smilebright')
    expect(miss).not.toBeNull()
    expect(
      hit,
      'the cached theme differs from the freshly-read one — the layout paints\n' +
        'one way on the first request after a deploy and another forever after',
    ).toEqual(miss)
  })

  it('the chrome timestamps come back as Dates, at the same instant', async () => {
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    await loadPublishedTheme('smilebright') // miss
    const hit = await loadPublishedTheme('smilebright')

    expect(hit!.chrome!.trialEndsAt).toBeInstanceOf(Date)
    expect(hit!.chrome!.siteLiveAt).toBeInstanceOf(Date)
    // Not merely "a Date" — the SAME instant. A revival that read the string
    // in the host's zone rather than UTC passes the type check above and
    // still moves a clinic's trial wall by hours.
    expect(hit!.chrome!.trialEndsAt!.getTime()).toBe(TRIAL_ENDS.getTime())
    expect(hit!.chrome!.siteLiveAt!.getTime()).toBe(SITE_LIVE.getTime())
  })

  /**
   * THE REGRESSION THIS BLOCK EXISTS TO PREVENT — the layout's copy of it.
   *
   * The site payload already has this test for the robots/sitemap routes.
   * This is the same crash on a far bigger surface: every public page of the
   * site, not two text routes.
   */
  it('resolveTrialState still works on the cached chrome', async () => {
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    const { resolveTrialState } = await import('@/lib/trial')

    await loadPublishedTheme('smilebright') // miss
    const hit = await loadPublishedTheme('smilebright')

    const now = new Date('2026-09-13T00:00:00.000Z')
    expect(() => resolveTrialState(hit!.chrome!, now)).not.toThrow()
    const trial = resolveTrialState(hit!.chrome!, now)
    expect(trial.onTrial).toBe(true)
    expect(trial.expired).toBe(false)
  })

  it('an expired trial still walls the site on a CACHED payload', async () => {
    // The expiry half is time-based, so it must be decided against the
    // request's clock rather than frozen into the entry: same cached chrome,
    // a later `now`, and the verdict has to flip.
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    const { resolveTrialState } = await import('@/lib/trial')

    await loadPublishedTheme('smilebright') // miss
    const hit = await loadPublishedTheme('smilebright')

    expect(resolveTrialState(hit!.chrome!, new Date('2026-09-14T00:00:00.000Z')).expired).toBe(false)
    expect(
      resolveTrialState(hit!.chrome!, new Date('2026-09-16T00:00:00.000Z')).expired,
      'the trial wall was decided inside the cache — a clinic whose trial ran\n' +
        'out mid-TTL kept serving, and one who paid stayed dark',
    ).toBe(true)
  })

  it('the toggles keep their schema defaults when the column is absent', async () => {
    // The left join types both NOT NULL columns as nullable, and the layout's
    // rules were `!== false` / `!== true` — the default wins when absent.
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    state.org = { ...THEME_ROW, chatWidgetEnabled: null, hidePoweredBy: null }
    const theme = await loadPublishedTheme('smilebright')
    expect(theme!.chrome!.chatWidgetEnabled, 'the chat bubble defaults ON').toBe(true)
    expect(theme!.chrome!.hidePoweredBy, 'the credit defaults SHOWN').toBe(false)
  })

  it('a clinic org with no profile row has no chrome, rather than a row of defaults', async () => {
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    state.org = { id: 'org_1', slug: 'smilebright', name: 'SmileBright', type: 'clinic' }
    const theme = await loadPublishedTheme('smilebright')
    expect(theme).not.toBeNull()
    expect(
      theme!.chrome,
      '"no profile" and "a profile with every toggle at its default" are\n' +
        'different states, and only one of them should paint chrome',
    ).toBeNull()
  })

  /**
   * THE PROPERTY THAT LICENSES THE WHOLE THING, MADE SELF-ENFORCING.
   *
   * The chrome may live in a shared cache for exactly one reason: not one of
   * its columns is draftable, so the published value IS the live value and
   * there is no viewer-dependent overlay to apply. Every other test here takes
   * that as given. Sentinel's review note on #654: nothing FAILED if it
   * stopped being true — make `announcement` or `displayName` draftable
   * tomorrow and the editor-vs-visitor test would stay green (it stages
   * `brandColor`/`tagline`) while a clinic's unpublished words reached every
   * visitor to their live site.
   *
   * Derived from the RUNTIME payload rather than a written-down list, so a
   * twelfth chrome field is covered the day somebody adds it — which is the
   * whole failure mode, since nobody adding one would think to come here.
   */
  it('no chrome column is draftable — the claim the cache rests on', async () => {
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    const { WEBSITE_DRAFT_COLUMNS } = await import('@/lib/website-draft')

    const theme = await loadPublishedTheme('smilebright')
    const chromeKeys = Object.keys(theme!.chrome!)
    expect(chromeKeys.length, 'the chrome payload came back empty').toBeGreaterThan(5)
    expect(WEBSITE_DRAFT_COLUMNS.size, 'the draftable set came back empty').toBeGreaterThan(5)

    const draftable = chromeKeys.filter((k) => WEBSITE_DRAFT_COLUMNS.has(k))
    expect(
      draftable,
      'These chrome columns are now DRAFTABLE, so the published value is no\n' +
        "longer the live value — and the chrome is cached per clinic with no\n" +
        'overlay applied. That puts an editor\'s unpublished words on the live\n' +
        'public site for every visitor, for up to the TTL.\n' +
        'Either take them out of PublishedSiteChrome and read them per request,\n' +
        'or apply the draft overlay to them in getClinicThemeBySlug the way\n' +
        'brand and template already are:\n' +
        draftable.join(', '),
    ).toEqual([])
  })

  it('the unpublished draft still never enters the theme entry', async () => {
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    state.org = { ...THEME_ROW, websiteDraft: { tagline: 'UNPUBLISHED' } }
    const theme = await loadPublishedTheme('smilebright')
    expect(theme!.hasWebsiteDraft).toBe(true)
    expect(
      JSON.stringify(theme),
      "a clinic's unpublished words rode into the shared theme entry",
    ).not.toContain('UNPUBLISHED')
  })

  it('the chrome is frozen, like the rest of the shared payload', async () => {
    const { loadPublishedTheme } = await import('@/lib/services/clinic-site-cache')
    const theme = await loadPublishedTheme('smilebright')
    expect(() => {
      ;(theme!.chrome as unknown as Record<string, unknown>).displayName = 'hacked'
    }).toThrow()
    expect(theme!.chrome!.displayName).toBe('SmileBright Dental')
  })

  it('a slug invalidation drops the chrome too', async () => {
    const { loadPublishedTheme, invalidateClinicSiteBySlug } = await import(
      '@/lib/services/clinic-site-cache'
    )
    const first = await loadPublishedTheme('smilebright')
    expect(first!.chrome!.hidePoweredBy).toBe(false)

    // The clinic hides the credit...
    state.org = { ...THEME_ROW, hidePoweredBy: true }
    expect(
      (await loadPublishedTheme('smilebright'))!.chrome!.hidePoweredBy,
      'the entry was never cached, so this test proves nothing',
    ).toBe(false)

    invalidateClinicSiteBySlug('smilebright')
    expect(
      (await loadPublishedTheme('smilebright'))!.chrome!.hidePoweredBy,
      'the toggle stayed stale — the clinic flips the switch, reloads their\n' +
        'own site and the credit is still there',
    ).toBe(true)
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
