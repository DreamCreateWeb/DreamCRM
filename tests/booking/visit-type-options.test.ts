/**
 * Unit tests for the BookForm visit-type dropdown options helper. The form
 * pulls options from the clinic's public-bookable visit-type catalog
 * (clinic_profile.visit_type_settings, filtered to bookablePublic), always
 * appending an "Other / not sure" fallback so patients can still book when
 * their reason isn't on the list. Each option carries its duration so the slot
 * grid checks the whole visit window against the clinic's chairs.
 */
import { describe, it, expect } from 'vitest'
import { buildVisitTypeOptions } from '@/app/site/[slug]/book/book-form'

describe('buildVisitTypeOptions', () => {
  it('maps clinic visit types to dropdown options (value/label/duration)', () => {
    const opts = buildVisitTypeOptions([
      { id: 's1', label: 'Cleaning', durationMinutes: 30 },
      { id: 's2', label: 'Cosmetic Whitening', durationMinutes: 60 },
    ])
    expect(opts[0]).toEqual({ value: 's1', label: 'Cleaning', durationMinutes: 30 })
    expect(opts[1]).toEqual({ value: 's2', label: 'Cosmetic Whitening', durationMinutes: 60 })
  })

  it('defaults a missing duration to 30', () => {
    const opts = buildVisitTypeOptions([{ id: 's1', label: 'Cleaning' }])
    expect(opts[0].durationMinutes).toBe(30)
  })

  it('always appends an "Other / not sure" option as the final entry', () => {
    const opts = buildVisitTypeOptions([
      { id: 's1', label: 'Cleaning', durationMinutes: 30 },
      { id: 's2', label: 'Whitening', durationMinutes: 30 },
    ])
    const last = opts[opts.length - 1]
    expect(last.value).toBe('other')
    expect(last.label).toBe('Other / not sure')
  })

  it('returns only the "Other" fallback when the clinic has no visit types', () => {
    const opts = buildVisitTypeOptions([])
    expect(opts).toHaveLength(1)
    expect(opts[0].value).toBe('other')
  })

  it('does NOT duplicate "Other" if the catalog already has an id="other"', () => {
    const opts = buildVisitTypeOptions([
      { id: 's1', label: 'Cleaning', durationMinutes: 30 },
      { id: 'other', label: 'Other', durationMinutes: 30 },
    ])
    const otherCount = opts.filter((o) => o.value === 'other').length
    expect(otherCount).toBe(1)
  })

  it('preserves order — clinic-configured types come before the fallback', () => {
    const types = [
      { id: 'a', label: 'A', durationMinutes: 30 },
      { id: 'b', label: 'B', durationMinutes: 30 },
      { id: 'c', label: 'C', durationMinutes: 30 },
    ]
    const opts = buildVisitTypeOptions(types)
    expect(opts.slice(0, 3).map((o) => o.value)).toEqual(['a', 'b', 'c'])
    expect(opts[3].value).toBe('other')
  })
})
