import { describe, it, expect } from 'vitest'
import { buildSitePagesIndex } from '@/lib/clinic-site-helpers'

/**
 * buildSitePagesIndex — the Pages manager's truth table: live rows mirror
 * buildStudioPages exactly; gated-off known pages appear as honest
 * `live:false` rows with a plain-language publish reason; manager link-outs
 * ride the right rows.
 */

const ALL_ON = { hasTeam: true, hasBlog: true, hasCareers: true, hasDentalPlans: true }
const ALL_OFF = { hasTeam: false, hasBlog: false, hasCareers: false, hasDentalPlans: false }

describe('buildSitePagesIndex', () => {
  it('everything on → every row live, no needs reasons', () => {
    const idx = buildSitePagesIndex(ALL_ON)
    expect(idx.every((p) => p.live)).toBe(true)
    expect(idx.some((p) => p.path === '/team')).toBe(true)
    expect(idx.some((p) => p.path === '/blog')).toBe(true)
    expect(idx.find((p) => p.path === '')?.label).toBe('Home')
  })

  it('everything off → the gated pages appear as not-live rows with reasons', () => {
    const idx = buildSitePagesIndex(ALL_OFF)
    const team = idx.find((p) => p.path === '/team')
    expect(team?.live).toBe(false)
    expect(team?.needs).toMatch(/team members/i)
    const blog = idx.find((p) => p.path === '/blog')
    expect(blog?.live).toBe(false)
    expect(blog?.needs).toMatch(/blog post/i)
    // Core pages stay live regardless.
    expect(idx.find((p) => p.path === '')?.live).toBe(true)
    expect(idx.find((p) => p.path === '/services')?.live).toBe(true)
  })

  it('manager link-outs land on the right rows, live or not', () => {
    const on = buildSitePagesIndex(ALL_ON)
    expect(on.find((p) => p.path === '/blog')?.manager?.href).toBe('/website/blog')
    expect(on.find((p) => p.path === '/careers')?.manager?.href).toBe('/website/careers')
    expect(on.find((p) => p.path === '/dental-plans')?.manager?.href).toBe('/payments/memberships')
    const off = buildSitePagesIndex(ALL_OFF)
    expect(off.find((p) => p.path === '/team')?.manager?.href).toBe('/website/content#staff')
  })

  it('template extras join as live rows', () => {
    const idx = buildSitePagesIndex({ ...ALL_ON, extraPages: [{ path: '/coloring', label: 'Coloring corner' }] })
    const extra = idx.find((p) => p.path === '/coloring')
    expect(extra?.live).toBe(true)
    expect(extra?.label).toBe('Coloring corner')
  })

  it('row keys are unique (the accordion contract)', () => {
    for (const gates of [ALL_ON, ALL_OFF]) {
      const keys = buildSitePagesIndex(gates).map((p) => p.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})
