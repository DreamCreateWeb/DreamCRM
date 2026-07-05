import { describe, it, expect } from 'vitest'
import { buildStudioPages } from '@/lib/clinic-site-helpers'

/**
 * The Studio page-navigator list — pins the gating truth table so the dropdown
 * mirrors the public nav exactly (a navigator entry that lands on notFound()
 * is worse than no entry).
 */
describe('buildStudioPages', () => {
  const none = { hasTeam: false, hasBlog: false, hasCareers: false, hasDentalPlans: false }
  const all = { hasTeam: true, hasBlog: true, hasCareers: true, hasDentalPlans: true }

  it('always includes the universal pages, in reading order', () => {
    const labels = buildStudioPages(none).map((p) => p.label)
    expect(labels).toEqual([
      'Home',
      'About',
      'New patients',
      'Services',
      'FAQ',
      'Insurance',
      'Payment & financing',
      'Book a visit',
    ])
  })

  it('home is the empty path (relative to /site/<slug>) and every other path is /-prefixed', () => {
    const pages = buildStudioPages(all)
    expect(pages[0]).toEqual({ label: 'Home', path: '' })
    for (const p of pages.slice(1)) {
      expect(p.path.startsWith('/')).toBe(true)
    }
  })

  it('gates team / blog / careers / dental-plans on their content flags', () => {
    const paths = buildStudioPages(all).map((p) => p.path)
    expect(paths).toContain('/team')
    expect(paths).toContain('/blog')
    expect(paths).toContain('/careers')
    expect(paths).toContain('/dental-plans')

    const gatedOff = buildStudioPages(none).map((p) => p.path)
    expect(gatedOff).not.toContain('/team')
    expect(gatedOff).not.toContain('/blog')
    expect(gatedOff).not.toContain('/careers')
    expect(gatedOff).not.toContain('/dental-plans')
  })

  it('each flag gates independently', () => {
    const paths = buildStudioPages({ ...none, hasBlog: true }).map((p) => p.path)
    expect(paths).toContain('/blog')
    expect(paths).not.toContain('/team')
    expect(paths).not.toContain('/careers')
    expect(paths).not.toContain('/dental-plans')
  })

  it('paths are unique (the select keys on them)', () => {
    const paths = buildStudioPages(all).map((p) => p.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
