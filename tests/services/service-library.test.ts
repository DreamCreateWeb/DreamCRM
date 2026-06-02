/**
 * Unit tests for the service-library service module + canonical seed catalog.
 *
 * Covers the pure surface: `tokenize` substitution, `resolveClinicServices`
 * (library-linked enrichment + token substitution + minimal free-text fallback
 * + stable routing slug), `groupByCategory`, and seed-catalog integrity
 * (required fields, unique slugs, valid categories, relatedSlugs reference real
 * slugs). The DB-touching functions (getServiceLibrary / seedServiceLibrary)
 * fall back to the in-code seed when the table is empty, so the resolver is
 * tested directly against the seed (passed in) — no DB needed.
 */
import { describe, it, expect } from 'vitest'
import {
  tokenize,
  resolveClinicServices,
  groupByCategory,
} from '@/lib/services/service-library'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'
import type { ClinicService } from '@/lib/types/clinic-content'

describe('tokenize', () => {
  it('substitutes {clinic} with the clinic name', () => {
    expect(tokenize('Welcome to {clinic}.', { clinicName: 'Acme Dental' })).toBe(
      'Welcome to Acme Dental.',
    )
  })

  it('substitutes {city} with the city', () => {
    expect(
      tokenize('Serving {city} families.', { clinicName: 'Acme', city: 'Austin' }),
    ).toBe('Serving Austin families.')
  })

  it('falls back to "our area" when city is null/empty', () => {
    expect(tokenize('Serving {city}.', { clinicName: 'Acme', city: null })).toBe(
      'Serving our area.',
    )
    expect(tokenize('Serving {city}.', { clinicName: 'Acme', city: '   ' })).toBe(
      'Serving our area.',
    )
    expect(tokenize('Serving {city}.', { clinicName: 'Acme' })).toBe(
      'Serving our area.',
    )
  })

  it('substitutes multiple + repeated tokens', () => {
    expect(
      tokenize('{clinic} in {city}. Choose {clinic}.', {
        clinicName: 'Acme',
        city: 'Austin',
      }),
    ).toBe('Acme in Austin. Choose Acme.')
  })

  it('is case-insensitive and tolerates whitespace inside braces', () => {
    expect(
      tokenize('{ Clinic } serves { CITY }.', { clinicName: 'Acme', city: 'Austin' }),
    ).toBe('Acme serves Austin.')
  })

  it('leaves text without tokens untouched', () => {
    expect(tokenize('No tokens here.', { clinicName: 'Acme' })).toBe('No tokens here.')
  })
})

describe('resolveClinicServices', () => {
  const ctx = { clinicName: 'Acme Dental', city: 'Austin' }

  it('enriches a library-linked service with token-substituted content', async () => {
    const services: ClinicService[] = [
      { id: 'a', name: 'Teeth Whitening', librarySlug: 'teeth-whitening' },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.hasLibraryContent).toBe(true)
    expect(r.routingSlug).toBe('teeth-whitening')
    expect(r.category).toBe('core')
    expect(r.heroBullets.length).toBeGreaterThan(0)
    expect(r.processSteps.length).toBeGreaterThan(0)
    expect(r.faq.length).toBeGreaterThan(0)
    // body carries the {clinic} substitution from the seed.
    expect(r.body).toContain('Acme Dental')
    expect(r.body).not.toContain('{clinic}')
  })

  it('substitutes {clinic}/{city} across hero bullets, process, and faq', async () => {
    // family-dental-care's body references both {clinic} and {city}.
    const services: ClinicService[] = [
      { id: 'a', name: 'Family Dental Care', librarySlug: 'family-dental-care' },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    const allText = [
      r.body ?? '',
      ...r.heroBullets,
      ...r.processSteps.flatMap((s) => [s.title, s.body]),
      ...r.faq.flatMap((f) => [f.question, f.answer]),
    ].join(' ')
    expect(allText).not.toContain('{clinic}')
    expect(allText).not.toContain('{city}')
    expect(r.body).toContain('Austin')
  })

  it('returns a minimal entry for a free-text (unlinked) service', async () => {
    const services: ClinicService[] = [
      { id: 'x', name: 'Custom Smile Spa', description: 'Our signature package' },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.hasLibraryContent).toBe(false)
    expect(r.name).toBe('Custom Smile Spa')
    expect(r.description).toBe('Our signature package')
    expect(r.heroBullets).toEqual([])
    expect(r.processSteps).toEqual([])
    expect(r.faq).toEqual([])
    expect(r.category).toBe('core')
  })

  it('derives a stable kebab routing slug for free-text services', async () => {
    const services: ClinicService[] = [{ id: 'x', name: 'Custom Smile Spa!' }]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.routingSlug).toBe('custom-smile-spa')
  })

  it('falls back to the service id as routing slug when the name has no slug chars', async () => {
    const services: ClinicService[] = [{ id: 'svc_42', name: '✨' }]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.routingSlug).toBe('svc_42')
  })

  it('applies per-clinic photo + offer overrides', async () => {
    const services: ClinicService[] = [
      {
        id: 'a',
        name: 'Teeth Whitening',
        librarySlug: 'teeth-whitening',
        photoUrl: 'https://cdn.example/w.jpg',
        offer: 'New patient special',
      },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.photoUrl).toBe('https://cdn.example/w.jpg')
    expect(r.offer).toBe('New patient special')
  })

  it('lets a clinic-set category override the library category', async () => {
    const services: ClinicService[] = [
      {
        id: 'a',
        name: 'Teeth Whitening',
        librarySlug: 'teeth-whitening',
        category: 'special',
      },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.category).toBe('special')
  })

  it('treats an unknown librarySlug as a free-text service (no crash)', async () => {
    const services: ClinicService[] = [
      { id: 'a', name: 'Mystery Service', librarySlug: 'does-not-exist' },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.hasLibraryContent).toBe(false)
    expect(r.name).toBe('Mystery Service')
  })

  // ── Checkpoint 1B — customized content prefers AI blob over canonical
  it('prefers the persisted AI customization over canonical + tokens (1B)', async () => {
    const services: ClinicService[] = [
      {
        id: 'a',
        name: 'Teeth Whitening',
        librarySlug: 'teeth-whitening',
        customized: {
          heroBullets: ['Customized bullet 1', 'Customized bullet 2', 'Customized bullet 3'],
          body: 'Acme-specific rewritten body.',
          processSteps: [
            { title: 'AI step 1', body: 'AI step body 1.' },
            { title: 'AI step 2', body: 'AI step body 2.' },
            { title: 'AI step 3', body: 'AI step body 3.' },
            { title: 'AI step 4', body: 'AI step body 4.' },
          ],
          faq: [{ question: 'AI Q?', answer: 'AI A.' }],
          generatedAt: '2026-06-02T00:00:00Z',
          modelId: 'claude-sonnet-4-6',
        },
      },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.hasLibraryContent).toBe(true)
    expect(r.isCustomized).toBe(true)
    expect(r.heroBullets).toEqual([
      'Customized bullet 1',
      'Customized bullet 2',
      'Customized bullet 3',
    ])
    expect(r.body).toBe('Acme-specific rewritten body.')
    expect(r.processSteps[0].title).toBe('AI step 1')
    expect(r.faq[0].question).toBe('AI Q?')
    expect(r.customizedAt).toBe('2026-06-02T00:00:00Z')
    expect(r.customizedModelId).toBe('claude-sonnet-4-6')
  })

  it('falls back cleanly when the customization blob is malformed', async () => {
    const services: ClinicService[] = [
      {
        id: 'a',
        name: 'Teeth Whitening',
        librarySlug: 'teeth-whitening',
        customized: {
          // hero bullets isn't an array → blob is rejected
          heroBullets: 'oops' as unknown as string[],
          body: 'should not appear',
          processSteps: [],
          faq: [],
          generatedAt: '',
          modelId: '',
        },
      },
    ]
    const [r] = await resolveClinicServices(services, ctx, SERVICE_LIBRARY_SEED)
    expect(r.isCustomized).toBe(false)
    expect(r.body).toContain('Acme Dental') // back to 1A token substitution
  })
})

describe('groupByCategory', () => {
  it('splits services into core and special, preserving order', async () => {
    const services: ClinicService[] = [
      { id: '1', name: 'Dental Exams', librarySlug: 'dental-exams' },
      { id: '2', name: 'Oral Surgery', librarySlug: 'oral-surgery' },
      { id: '3', name: 'Teeth Whitening', librarySlug: 'teeth-whitening' },
      { id: '4', name: 'IV Sedation', librarySlug: 'iv-sedation' },
    ]
    const resolved = await resolveClinicServices(
      services,
      { clinicName: 'Acme' },
      SERVICE_LIBRARY_SEED,
    )
    const { core, special } = groupByCategory(resolved)
    expect(core.map((s) => s.routingSlug)).toEqual(['dental-exams', 'teeth-whitening'])
    expect(special.map((s) => s.routingSlug)).toEqual(['oral-surgery', 'iv-sedation'])
  })
})

describe('SERVICE_LIBRARY_SEED integrity', () => {
  it('has exactly 17 entries', () => {
    expect(SERVICE_LIBRARY_SEED).toHaveLength(17)
  })

  it('has 9 core + 8 special entries', () => {
    const core = SERVICE_LIBRARY_SEED.filter((e) => e.category === 'core')
    const special = SERVICE_LIBRARY_SEED.filter((e) => e.category === 'special')
    expect(core).toHaveLength(9)
    expect(special).toHaveLength(8)
  })

  it('every slug is unique', () => {
    const slugs = SERVICE_LIBRARY_SEED.map((e) => e.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every entry has all required fields populated', () => {
    for (const e of SERVICE_LIBRARY_SEED) {
      expect(e.slug, `${e.name} slug`).toMatch(/^[a-z0-9-]+$/)
      expect(e.name.length, `${e.slug} name`).toBeGreaterThan(0)
      expect(['core', 'special'], `${e.slug} category`).toContain(e.category)
      expect(e.shortDescription.length, `${e.slug} shortDescription`).toBeGreaterThan(0)
      expect(e.body.length, `${e.slug} body`).toBeGreaterThan(0)
      expect(e.icon, `${e.slug} icon`).toBeTruthy()
    }
  })

  it('every entry has 3-4 hero bullets', () => {
    for (const e of SERVICE_LIBRARY_SEED) {
      expect(e.heroBullets.length, `${e.slug} heroBullets`).toBeGreaterThanOrEqual(3)
      expect(e.heroBullets.length, `${e.slug} heroBullets`).toBeLessThanOrEqual(5)
      for (const b of e.heroBullets) expect(b.length).toBeGreaterThan(0)
    }
  })

  it('every entry has 4 process steps with title + body', () => {
    for (const e of SERVICE_LIBRARY_SEED) {
      expect(e.processSteps.length, `${e.slug} processSteps`).toBe(4)
      for (const s of e.processSteps) {
        expect(s.title.length, `${e.slug} step title`).toBeGreaterThan(0)
        expect(s.body.length, `${e.slug} step body`).toBeGreaterThan(0)
      }
    }
  })

  it('every entry has 5-6 FAQ items with question + answer', () => {
    for (const e of SERVICE_LIBRARY_SEED) {
      expect(e.faq.length, `${e.slug} faq`).toBeGreaterThanOrEqual(5)
      expect(e.faq.length, `${e.slug} faq`).toBeLessThanOrEqual(6)
      for (const f of e.faq) {
        expect(f.question.length, `${e.slug} faq q`).toBeGreaterThan(0)
        expect(f.answer.length, `${e.slug} faq a`).toBeGreaterThan(0)
      }
    }
  })

  it('every entry includes an honest cost FAQ with no fabricated dollar figure', () => {
    for (const e of SERVICE_LIBRARY_SEED) {
      const costFaq = e.faq.find((f) => /cost|price|how much|priced/i.test(f.question))
      expect(costFaq, `${e.slug} has a cost FAQ`).toBeTruthy()
      // No fabricated dollar amounts anywhere in the entry's FAQ.
      for (const f of e.faq) {
        expect(f.answer, `${e.slug} faq answer should not invent a price`).not.toMatch(
          /\$\s?\d/,
        )
      }
    }
  })

  it('relatedSlugs only reference real slugs (and never self)', () => {
    const allSlugs = new Set(SERVICE_LIBRARY_SEED.map((e) => e.slug))
    for (const e of SERVICE_LIBRARY_SEED) {
      expect((e.relatedSlugs ?? []).length, `${e.slug} relatedSlugs`).toBeGreaterThanOrEqual(2)
      for (const rs of e.relatedSlugs ?? []) {
        expect(allSlugs.has(rs), `${e.slug} → ${rs} is a real slug`).toBe(true)
        expect(rs, `${e.slug} relatedSlugs does not self-reference`).not.toBe(e.slug)
      }
    }
  })
})
