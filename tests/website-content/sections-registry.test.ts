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
