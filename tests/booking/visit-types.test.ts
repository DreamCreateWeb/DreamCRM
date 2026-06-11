import { describe, it, expect } from 'vitest'
import {
  resolveVisitTypes,
  visitTypeDuration,
  publicVisitTypes,
  portalVisitTypes,
  findVisitType,
  DEFAULT_VISIT_TYPES,
  OTHER_VISIT_TYPE_ID,
  type VisitType,
} from '@/lib/types/visit-types'

describe('resolveVisitTypes', () => {
  it('returns the default catalog for null', () => {
    const got = resolveVisitTypes(null)
    expect(got).toEqual(DEFAULT_VISIT_TYPES)
    // Defensive copy — mutating the result must not mutate the export.
    got[0].label = 'CHANGED'
    expect(DEFAULT_VISIT_TYPES[0].label).not.toBe('CHANGED')
  })

  it('returns the default catalog for an empty array / non-array', () => {
    expect(resolveVisitTypes([])).toEqual(DEFAULT_VISIT_TYPES)
    expect(resolveVisitTypes('nope')).toEqual(DEFAULT_VISIT_TYPES)
    expect(resolveVisitTypes(42)).toEqual(DEFAULT_VISIT_TYPES)
  })

  it('includes the standard checkup/cleaning/emergency defaults', () => {
    const ids = DEFAULT_VISIT_TYPES.map((t) => t.id)
    expect(ids).toContain('checkup')
    expect(ids).toContain('cleaning')
    expect(ids).toContain('emergency')
    expect(ids).toContain(OTHER_VISIT_TYPE_ID)
  })

  it('sanitizes a stored custom catalog (slug ids, clamp durations, coerce flags)', () => {
    const stored = [
      { id: 'Implant Consult', label: 'Implant consult', durationMinutes: 60, bookablePublic: true, bookablePortal: false },
      { id: 'cleaning', label: 'Cleaning', durationMinutes: 5, bookablePublic: 1, bookablePortal: 0 },
    ]
    const got = resolveVisitTypes(stored)
    const implant = got.find((t) => t.id === 'implant_consult')
    expect(implant).toBeTruthy()
    expect(implant!.durationMinutes).toBe(60)
    expect(implant!.bookablePublic).toBe(true)
    expect(implant!.bookablePortal).toBe(false)
    const cleaning = got.find((t) => t.id === 'cleaning')!
    // Duration clamped up to the 15-min floor.
    expect(cleaning.durationMinutes).toBe(15)
    expect(cleaning.bookablePublic).toBe(true)
    expect(cleaning.bookablePortal).toBe(false)
  })

  it('always guarantees an "Other" fallback even when the stored list omits it', () => {
    const got = resolveVisitTypes([{ id: 'cleaning', label: 'Cleaning', durationMinutes: 30 }])
    expect(got.some((t) => t.id === OTHER_VISIT_TYPE_ID)).toBe(true)
  })

  it('de-dupes repeated ids', () => {
    const got = resolveVisitTypes([
      { id: 'cleaning', label: 'Cleaning', durationMinutes: 30 },
      { id: 'cleaning', label: 'Dupe', durationMinutes: 45 },
    ])
    expect(got.filter((t) => t.id === 'cleaning')).toHaveLength(1)
  })

  it('defaults both bookable flags to true when absent on a custom row', () => {
    const got = resolveVisitTypes([{ id: 'whitening', label: 'Whitening' }])
    const w = got.find((t) => t.id === 'whitening')!
    expect(w.bookablePublic).toBe(true)
    expect(w.bookablePortal).toBe(true)
  })
})

describe('visitTypeDuration', () => {
  it('returns the catalog duration for a known id', () => {
    const stored: VisitType[] = [
      { id: 'root_canal', label: 'Root canal', durationMinutes: 90, bookablePublic: false, bookablePortal: false },
    ]
    expect(visitTypeDuration(stored, 'root_canal')).toBe(90)
  })

  it('falls back to 30 for an unknown id', () => {
    expect(visitTypeDuration(null, 'mystery')).toBe(30)
    expect(visitTypeDuration(null, null)).toBe(30)
  })

  it('uses default catalog durations when settings are null', () => {
    expect(visitTypeDuration(null, 'cleaning')).toBe(30)
  })
})

describe('publicVisitTypes / portalVisitTypes', () => {
  it('publicVisitTypes filters to bookablePublic', () => {
    const stored: VisitType[] = [
      { id: 'a', label: 'A', durationMinutes: 30, bookablePublic: true, bookablePortal: false },
      { id: 'b', label: 'B', durationMinutes: 30, bookablePublic: false, bookablePortal: true },
    ]
    const got = publicVisitTypes(stored)
    expect(got.map((t) => t.id)).toContain('a')
    expect(got.map((t) => t.id)).not.toContain('b')
  })

  it('portalVisitTypes filters to bookablePortal', () => {
    const stored: VisitType[] = [
      { id: 'a', label: 'A', durationMinutes: 30, bookablePublic: true, bookablePortal: false },
      { id: 'b', label: 'B', durationMinutes: 30, bookablePublic: false, bookablePortal: true },
    ]
    const got = portalVisitTypes(stored)
    expect(got.map((t) => t.id)).toContain('b')
    expect(got.map((t) => t.id)).not.toContain('a')
  })
})

describe('findVisitType', () => {
  it('finds by id and returns null for missing', () => {
    const list = resolveVisitTypes(null)
    expect(findVisitType(list, 'cleaning')?.id).toBe('cleaning')
    expect(findVisitType(list, 'nope')).toBeNull()
    expect(findVisitType(list, null)).toBeNull()
  })
})
