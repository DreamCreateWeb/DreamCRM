/**
 * Unit tests for the BookForm visit-type dropdown options helper. The form
 * was originally a hardcoded `SERVICE_TYPES` array (checkup/cleaning/...);
 * v1.1 pulls options from the clinic's configured services on the dashboard,
 * always appending an "Other / not sure" fallback so patients can still
 * book when their reason isn't on the list.
 */
import { describe, it, expect } from 'vitest'
import { buildVisitTypeOptions } from '@/app/site/[slug]/book/book-form'

describe('buildVisitTypeOptions', () => {
  it('maps clinic services to dropdown options', () => {
    const opts = buildVisitTypeOptions([
      { id: 's1', name: 'Cleaning' },
      { id: 's2', name: 'Cosmetic Whitening' },
    ])
    expect(opts[0]).toEqual({ value: 's1', label: 'Cleaning' })
    expect(opts[1]).toEqual({ value: 's2', label: 'Cosmetic Whitening' })
  })

  it('always appends an "Other / not sure" option as the final entry', () => {
    const opts = buildVisitTypeOptions([
      { id: 's1', name: 'Cleaning' },
      { id: 's2', name: 'Whitening' },
    ])
    const last = opts[opts.length - 1]
    expect(last).toEqual({ value: 'other', label: 'Other / not sure' })
  })

  it('returns only the "Other" fallback when the clinic has no services', () => {
    const opts = buildVisitTypeOptions([])
    expect(opts).toEqual([{ value: 'other', label: 'Other / not sure' }])
  })

  it('does NOT duplicate "Other" if the clinic happens to have a service with id="other"', () => {
    // Edge case: a clinic could nominally have a service named "Other".
    // The helper should not append a second "Other" option in that case.
    const opts = buildVisitTypeOptions([
      { id: 's1', name: 'Cleaning' },
      { id: 'other', name: 'Other' },
    ])
    const otherCount = opts.filter((o) => o.value === 'other').length
    expect(otherCount).toBe(1)
  })

  it('preserves order — clinic-configured services come before the fallback', () => {
    const services = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    const opts = buildVisitTypeOptions(services)
    expect(opts.slice(0, 3)).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ])
    expect(opts[3].value).toBe('other')
  })
})
