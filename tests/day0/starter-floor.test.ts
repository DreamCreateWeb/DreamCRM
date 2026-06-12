import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Day-0 COMPLETE FLOOR (Wave 1 — deterministic, AI-free). A real clinic
 * finishes checkout with a near-empty clinic_profile; applyStarterFloor fills
 * the TEXT + SERVICE side so the public site reads as finished without the
 * clinic touching anything. This file drives:
 *   - applyStarterFloor (null-only fill / idempotency / no-clobber)
 *   - the 4 canonical core services it seeds (built from the library 1A path)
 *   - that those services actually RENDER via resolveClinicServices
 *   - the trust boundary (never seeds staff / testimonials / insurance carriers)
 */

const state: {
  profile: Record<string, unknown> | null
  updates: Array<Record<string, unknown>>
} = { profile: null, updates: [] }

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const schema = await import('@/lib/db/schema')

  function rowsFor(t: unknown): unknown[] {
    if (t === clinicProfile) return state.profile ? [state.profile] : []
    return []
  }

  type Chain = Promise<unknown[]> & Record<string, unknown>
  function chain(rows: unknown[]): Chain {
    const p = Promise.resolve(rows) as Chain
    p.from = (t: unknown) => chain(rowsFor(t))
    p.where = () => p
    p.limit = () => p
    return p
  }

  return {
    db: {
      select: () => chain([]),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(patch)
          },
        }),
      }),
    },
    schema,
  }
})

import {
  applyStarterFloor,
  buildStarterServices,
  starterAbout,
  STARTER_TAGLINE,
  STARTER_ABOUT_BASE,
  STARTER_STATS,
  STARTER_FAQ_ITEMS,
  STARTER_PAYMENT_METHODS,
  STARTER_CANCELLATION_POLICY,
} from '@/lib/services/starter-pack'
import { resolveClinicServices } from '@/lib/services/service-library'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'
import { DEFAULT_FAQ_ITEMS, DEFAULT_PAYMENT_METHODS } from '@/lib/types/clinic-content'

beforeEach(() => {
  state.profile = null
  state.updates = []
})

/** A clinic_profile shaped as a brand-new (post-checkout) clinic: every
 *  floor-owned field still null. */
function emptyProfile() {
  return {
    tagline: null,
    about: null,
    stats: null,
    faq: null,
    paymentMethods: null,
    cancellationPolicy: null,
    services: null,
  }
}

describe('buildStarterServices', () => {
  it('seeds exactly the 4 canonical core services, library-linked, no AI blob', () => {
    const svcs = buildStarterServices()
    expect(svcs).toHaveLength(4)
    expect(svcs.map((s) => s.librarySlug)).toEqual([
      'family-dental-care',
      'dental-exams',
      'dental-hygiene',
      'teeth-whitening',
    ])
    // Every slug must exist in the canonical seed (no dead links).
    const seedSlugs = new Set(SERVICE_LIBRARY_SEED.map((e) => e.slug))
    for (const s of svcs) expect(seedSlugs.has(s.librarySlug!)).toBe(true)
    // 1A path: name/icon/category come from the library; NO customized blob.
    for (const s of svcs) {
      expect(s.customized).toBeUndefined()
      expect(s.name).toBeTruthy()
      expect(s.category).toBe('core')
    }
  })

  it('uses deterministic ids so a re-run is recognizably "still starter"', () => {
    expect(buildStarterServices().map((s) => s.id)).toEqual(
      buildStarterServices().map((s) => s.id),
    )
    expect(buildStarterServices()[0].id).toBe('starter-svc-family-dental-care')
  })
})

describe('starterAbout', () => {
  it('returns the base copy verbatim when no city is known', () => {
    expect(starterAbout(null)).toBe(STARTER_ABOUT_BASE)
    expect(starterAbout('   ')).toBe(STARTER_ABOUT_BASE)
  })
  it('weaves the city in when known', () => {
    const out = starterAbout('Austin')
    expect(out.startsWith(STARTER_ABOUT_BASE)).toBe(true)
    expect(out).toContain('Austin')
  })
})

describe('STARTER constants — trust + content rules', () => {
  it('stats are 3 QUALITATIVE chips (no invented numeric counts)', () => {
    expect(STARTER_STATS).toHaveLength(3)
    // The only numeric value is the dynamic review_count seed ("0"); the rest
    // are qualitative words, never a fabricated figure.
    const nonDynamic = STARTER_STATS.filter((s) => !s.dynamic)
    for (const s of nonDynamic) expect(/^\d[\d,]*\+?$/.test(s.value)).toBe(false)
  })
  it('persists 6 real FAQ rows drawn from the shared defaults', () => {
    expect(STARTER_FAQ_ITEMS).toHaveLength(6)
    const defaultIds = new Set(DEFAULT_FAQ_ITEMS.map((f) => f.id))
    for (const f of STARTER_FAQ_ITEMS) {
      expect(defaultIds.has(f.id)).toBe(true)
      expect(f.question).toBeTruthy()
      expect(f.answer).toBeTruthy()
    }
  })
  it('payment methods mirror the universal default list', () => {
    expect(STARTER_PAYMENT_METHODS).toEqual(DEFAULT_PAYMENT_METHODS)
  })
  it('cancellation policy carries no dollar figures', () => {
    expect(STARTER_CANCELLATION_POLICY).not.toMatch(/\$\d/)
    expect(STARTER_CANCELLATION_POLICY.length).toBeGreaterThan(40)
  })
})

describe('applyStarterFloor', () => {
  it('fills every floor field on a brand-new (all-null) profile', async () => {
    state.profile = emptyProfile()
    const res = await applyStarterFloor('org_1', { displayName: 'Bright Smiles', city: 'Austin' })

    expect(res.applied).toBe(true)
    expect(state.updates).toHaveLength(1)
    const patch = state.updates[0]
    expect(patch.tagline).toBe(STARTER_TAGLINE)
    expect(patch.about).toBe(starterAbout('Austin'))
    expect(patch.stats).toEqual(STARTER_STATS)
    expect(patch.faq).toEqual(STARTER_FAQ_ITEMS)
    expect(patch.paymentMethods).toEqual(STARTER_PAYMENT_METHODS)
    expect(patch.cancellationPolicy).toBe(STARTER_CANCELLATION_POLICY)
    expect((patch.services as unknown[]).length).toBe(4)
    expect(patch.updatedAt).toBeInstanceOf(Date)
    // TRUST BOUNDARY: never pre-fills staff / testimonials / insurance / financing.
    expect(patch).not.toHaveProperty('staff')
    expect(patch).not.toHaveProperty('testimonials')
    expect(patch).not.toHaveProperty('acceptedInsuranceCarriers')
    expect(patch).not.toHaveProperty('financingPartners')
  })

  it('uses city-free about copy when the clinic has no city (managed path)', async () => {
    state.profile = emptyProfile()
    await applyStarterFloor('org_1', { displayName: 'Bright Smiles' })
    expect(state.updates[0].about).toBe(STARTER_ABOUT_BASE)
  })

  it('is idempotent — a second run over the seeded values writes nothing', async () => {
    // Simulate the profile AFTER a first floor application.
    state.profile = {
      tagline: STARTER_TAGLINE,
      about: starterAbout('Austin'),
      stats: STARTER_STATS,
      faq: STARTER_FAQ_ITEMS,
      paymentMethods: STARTER_PAYMENT_METHODS,
      cancellationPolicy: STARTER_CANCELLATION_POLICY,
      services: buildStarterServices(),
    }
    const res = await applyStarterFloor('org_1', { displayName: 'Bright Smiles', city: 'Austin' })
    expect(res.applied).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('only fills NULL fields — human-edited fields are never clobbered', async () => {
    state.profile = {
      tagline: 'Our own tagline', // human-edited → keep
      about: null, // empty → fill
      stats: [{ id: 'mine', value: '12 yrs', label: 'serving the neighborhood' }], // keep
      faq: null, // fill
      paymentMethods: ['Cash only'], // keep
      cancellationPolicy: null, // fill
      services: [{ id: 'svc', name: 'My custom service' }], // keep (don't add starter 4)
    }
    const res = await applyStarterFloor('org_1', { displayName: 'Bright Smiles', city: 'Austin' })
    expect(res.applied).toBe(true)
    const patch = state.updates[0]
    // Filled the empties only.
    expect(res.fields.sort()).toEqual(['about', 'cancellationPolicy', 'faq'])
    expect(patch.about).toBe(starterAbout('Austin'))
    expect(patch.faq).toEqual(STARTER_FAQ_ITEMS)
    expect(patch.cancellationPolicy).toBe(STARTER_CANCELLATION_POLICY)
    // Left the human values untouched (not present in the patch).
    expect(patch).not.toHaveProperty('tagline')
    expect(patch).not.toHaveProperty('stats')
    expect(patch).not.toHaveProperty('paymentMethods')
    expect(patch).not.toHaveProperty('services')
  })

  it('treats whitespace-only strings + empty arrays as fillable', async () => {
    state.profile = {
      tagline: '   ',
      about: '\n',
      stats: [],
      faq: [],
      paymentMethods: [],
      cancellationPolicy: '  ',
      services: [],
    }
    const res = await applyStarterFloor('org_1', { displayName: 'Bright Smiles' })
    expect(res.applied).toBe(true)
    expect(res.fields.sort()).toEqual(
      ['about', 'cancellationPolicy', 'faq', 'paymentMethods', 'services', 'stats', 'tagline'].sort(),
    )
  })

  it('no-ops cleanly when the profile row is missing', async () => {
    state.profile = null
    const res = await applyStarterFloor('org_missing', { displayName: 'X' })
    expect(res.applied).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})

describe('starter services render through the resolver (no dead links)', () => {
  it('resolveClinicServices enriches all 4 starter services with library content', async () => {
    const services = buildStarterServices()
    // Pass the canonical seed directly so the resolver needs no DB.
    const enriched = await resolveClinicServices(
      services,
      { clinicName: 'Bright Smiles', city: 'Austin' },
      SERVICE_LIBRARY_SEED,
    )
    expect(enriched).toHaveLength(4)
    for (const e of enriched) {
      expect(e.hasLibraryContent).toBe(true)
      expect(e.heroBullets.length).toBeGreaterThan(0)
      expect(e.body).toBeTruthy()
      expect(e.processSteps.length).toBeGreaterThan(0)
      expect(e.faq.length).toBeGreaterThan(0)
      // 1A path (no AI blob) → not customized.
      expect(e.isCustomized).toBe(false)
    }
    // Token substitution happened — {clinic}/{city} are gone, name is woven in.
    const family = enriched.find((e) => e.routingSlug === 'family-dental-care')!
    expect(family.body).toContain('Bright Smiles')
    expect(family.body).not.toContain('{clinic}')
    expect(family.body).not.toContain('{city}')
  })
})
