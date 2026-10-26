import { describe, it, expect } from 'vitest'
import {
  CONTENT_SECTIONS,
  contentSectionsFor,
  contentCompleteness,
  type ContentProfilePick,
} from '@/lib/website-content-sections'

/**
 * The Content section registry — the one list driving the content page's
 * rail, the hub's completeness stat, and (post Phase-5) the settings
 * search-index deep links. Pins the truth table across empty/common/edge.
 */

function pick(over: Partial<ContentProfilePick> = {}): ContentProfilePick {
  return {
    tagline: null,
    about: null,
    services: null,
    staff: null,
    stats: null,
    officePhotos: null,
    faq: null,
    differenceChips: null,
    coloringPages: null,
    acceptedInsuranceCarriers: null,
    paymentMethods: null,
    financingPartners: null,
    cancellationPolicy: null,
    template: 'modern',
    ...over,
  } as ContentProfilePick
}

describe('CONTENT_SECTIONS', () => {
  it('every section has a unique anchor id (the rail + deep-link contract)', () => {
    const ids = CONTENT_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Ids the settings search-index will repoint to in Phase 5.
    for (const id of ['story', 'services', 'staff', 'stats', 'photos', 'faq', 'insurance', 'methods', 'financing', 'cancellation']) {
      expect(ids).toContain(id)
    }
  })

  it('day-0 clinic: nothing filled', () => {
    const { filled, total } = contentCompleteness(pick())
    expect(filled).toBe(0)
    expect(total).toBe(CONTENT_SECTIONS.length - 1) // coloring is pediatric-only
  })

  it('coloring pages only count for the pediatric template', () => {
    expect(contentSectionsFor('modern').some((s) => s.id === 'coloring')).toBe(false)
    expect(contentSectionsFor('pediatric').some((s) => s.id === 'coloring')).toBe(true)
    expect(contentSectionsFor(null).some((s) => s.id === 'coloring')).toBe(false)
  })

  it('common mature clinic counts real content only', () => {
    const p = pick({
      tagline: 'Care that feels human',
      about: 'We are a friendly practice.',
      services: [{ id: 's1', name: 'Cleanings' }] as never,
      staff: [{ id: 'st1', name: 'Dr. A' }] as never,
      acceptedInsuranceCarriers: ['Delta Dental'] as never,
    })
    const { filled } = contentCompleteness(p)
    expect(filled).toBe(4) // story + services + staff + insurance
  })

  it('edge: whitespace-only story is not "filled"; empty arrays are not "filled"', () => {
    const p = pick({ tagline: '  ', about: 'x', services: [] as never, paymentMethods: [] as never })
    const sections = Object.fromEntries(contentSectionsFor('modern').map((s) => [s.id, s.filled(p)]))
    expect(sections.story).toBe(false)
    expect(sections.services).toBe(false)
    expect(sections.methods).toBe(false)
  })
})

describe('the rail’s words (2026-10-15)', () => {
  it('every section has a group, a public path and a summary that is null when empty', async () => {
    const { CONTENT_SECTIONS, CONTENT_GROUPS } = await import('@/lib/website-content-sections')
    const groups = new Set(CONTENT_GROUPS.map((g) => g.id))
    const empty = {
      tagline: null, about: null, services: null, staff: null, stats: null, officePhotos: null, faq: null,
      differenceChips: null, coloringPages: null, acceptedInsuranceCarriers: null, paymentMethods: null,
      financingPartners: null, cancellationPolicy: null, template: 'modern',
    }
    for (const s of CONTENT_SECTIONS) {
      expect(groups.has(s.group), s.id).toBe(true)
      expect(s.sitePath, s.id).toMatch(/^\//)
      expect(s.summary(empty), s.id).toBeNull()
    }
  })

  it('counts in plain words, and financing says when the widget is on', async () => {
    const { CONTENT_SECTIONS } = await import('@/lib/website-content-sections')
    const by = Object.fromEntries(CONTENT_SECTIONS.map((s) => [s.id, s]))
    const p = {
      tagline: 'Hi', about: '', services: [{}, {}, {}], staff: [{}], stats: null, officePhotos: [{}, {}], faq: [{}],
      differenceChips: ['a'], coloringPages: null, acceptedInsuranceCarriers: ['Delta'], paymentMethods: ['Cash', 'Card'],
      financingPartners: [{ id: 'f', name: 'Cherry', provider: 'cherry', slug: 'x', showWidget: true, applyUrl: null, description: null, logoUrl: null }],
      cancellationPolicy: '48 hours', template: 'modern',
    } as never
    expect(by.story.summary(p)).toBe('Tagline only — no about yet')
    expect(by.services.summary(p)).toBe('3 services')
    expect(by.staff.summary(p)).toBe('1 on the team')
    expect(by.photos.summary(p)).toBe('2 photos')
    expect(by.faq.summary(p)).toBe('1 question')
    expect(by.methods.summary(p)).toBe('2 ways to pay')
    expect(by.financing.summary(p)).toBe('1 partner · widget on')
    expect(by.cancellation.summary(p)).toBe('Written')
  })
})

describe('the client view', () => {
  it('toContentSectionView carries no functions — it crosses the server → client boundary', async () => {
    const { toContentSectionView, CONTENT_SECTIONS } = await import('@/lib/website-content-sections')
    for (const s of CONTENT_SECTIONS) {
      const view = toContentSectionView(s)
      expect(Object.values(view).some((v) => typeof v === 'function')).toBe(false)
      expect(Object.keys(view).sort()).toEqual(['desc', 'group', 'id', 'label', 'sitePath'])
      // JSON round-trip is the boundary's own test.
      expect(JSON.parse(JSON.stringify(view))).toEqual(view)
    }
  })
})

describe('"See it on your site" follows the design (2026-10-26)', () => {
  it('stats and photos point at Home only where that design draws them, else /about', async () => {
    const { CONTENT_SECTIONS, toContentSectionView } = await import('@/lib/website-content-sections')
    const by = Object.fromEntries(CONTENT_SECTIONS.map((s) => [s.id, s]))
    expect(toContentSectionView(by.stats, 'modern').sitePath).toBe('/')
    expect(toContentSectionView(by.stats, 'hometeam').sitePath).toBe('/')
    expect(toContentSectionView(by.stats, 'hometown').sitePath).toBe('/about')
    expect(toContentSectionView(by.stats, 'pediatric').sitePath).toBe('/about')
    expect(toContentSectionView(by.photos, 'cosmetic').sitePath).toBe('/')
    expect(toContentSectionView(by.photos, 'pediatric').sitePath).toBe('/about')
    expect(toContentSectionView(by.photos, 'hometown').sitePath).toBe('/about')
    // An unknown or missing design reads as the default (modern), like the registry.
    expect(toContentSectionView(by.stats, null).sitePath).toBe('/')
    expect(toContentSectionView(by.stats, 'nope').sitePath).toBe('/')
    // Sections with a fixed path are untouched by the design.
    expect(toContentSectionView(by.services, 'hometown').sitePath).toBe('/services')
  })
})
