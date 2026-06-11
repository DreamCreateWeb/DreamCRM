import { describe, it, expect } from 'vitest'
import {
  resolveSeoMeta,
  compactSeoMeta,
  applySeoOverride,
  SEO_PAGE_KEYS,
  type PageSeoMeta,
} from '@/lib/types/seo-meta'

describe('resolveSeoMeta', () => {
  it('returns every page key (empty) for null / junk input', () => {
    for (const input of [null, undefined, 42, 'nope', []]) {
      const m = resolveSeoMeta(input as unknown)
      expect(Object.keys(m).sort()).toEqual([...SEO_PAGE_KEYS].sort())
      for (const k of SEO_PAGE_KEYS) expect(m[k]).toEqual({})
    }
  })

  it('keeps valid per-page title + description', () => {
    const m = resolveSeoMeta({
      home: { title: 'Best Dentist', description: 'Come on in' },
      book: { title: 'Book now' },
    })
    expect(m.home).toEqual({ title: 'Best Dentist', description: 'Come on in' })
    expect(m.book).toEqual({ title: 'Book now' })
    expect(m.faq).toEqual({})
  })

  it('drops unknown page keys', () => {
    const m = resolveSeoMeta({ home: { title: 'X' }, bogus: { title: 'Y' } })
    expect(m.home.title).toBe('X')
    expect((m as Record<string, unknown>).bogus).toBeUndefined()
  })

  it('trims, collapses whitespace, and drops blank fields', () => {
    const m = resolveSeoMeta({ about: { title: '  Multi   space  ', description: '   ' } })
    expect(m.about.title).toBe('Multi space')
    expect(m.about.description).toBeUndefined()
  })

  it('ignores non-string field values', () => {
    const m = resolveSeoMeta({ services: { title: 123, description: { x: 1 } } })
    expect(m.services).toEqual({})
  })

  it('clamps over-long fields to the hard caps', () => {
    const longTitle = 'a'.repeat(500)
    const longDesc = 'b'.repeat(1000)
    const m = resolveSeoMeta({ home: { title: longTitle, description: longDesc } })
    expect(m.home.title!.length).toBeLessThanOrEqual(120)
    expect(m.home.description!.length).toBeLessThanOrEqual(320)
  })
})

describe('compactSeoMeta', () => {
  it('returns null when nothing is set', () => {
    expect(compactSeoMeta(resolveSeoMeta(null))).toBeNull()
  })

  it('keeps only keys with a set field', () => {
    const full = resolveSeoMeta({
      home: { title: 'H' },
      about: { description: 'A' },
      faq: {},
    })
    const c = compactSeoMeta(full)
    expect(c).toEqual({ home: { title: 'H' }, about: { description: 'A' } })
    expect(c).not.toHaveProperty('faq')
  })

  it('round-trips through resolve', () => {
    const stored = { team: { title: 'Our team', description: 'Meet us' } }
    const c = compactSeoMeta(resolveSeoMeta(stored))
    expect(c).toEqual(stored)
  })
})

describe('applySeoOverride', () => {
  const derived = { title: 'Derived T', description: 'Derived D' }

  it('falls back to derived when override undefined', () => {
    expect(applySeoOverride(undefined, derived)).toEqual(derived)
  })

  it('falls back to derived when override fields blank', () => {
    expect(applySeoOverride({ title: '   ', description: '' }, derived)).toEqual(derived)
  })

  it('override wins when set', () => {
    expect(applySeoOverride({ title: 'Mine' }, derived)).toEqual({
      title: 'Mine',
      description: 'Derived D',
    })
    expect(applySeoOverride({ description: 'My D' }, derived)).toEqual({
      title: 'Derived T',
      description: 'My D',
    })
  })

  it('independently overrides each field', () => {
    const o: PageSeoMeta['home'] = { title: 'T2', description: 'D2' }
    expect(applySeoOverride(o, derived)).toEqual({ title: 'T2', description: 'D2' })
  })
})
