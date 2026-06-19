import { describe, it, expect } from 'vitest'
import {
  normalizeAppointmentViewFilters,
  isEmptyAppointmentViewFilters,
  appointmentViewFiltersToQuery,
  describeAppointmentViewFilters,
} from '@/lib/types/appointment-views'

describe('normalizeAppointmentViewFilters', () => {
  it('keeps recognized fields and drops junk + empties', () => {
    const f = normalizeAppointmentViewFilters({
      window: 'past_30d',
      attention: ['no_show', 'bogus', 'unconfirmed'],
      providerId: '  prov_1 ',
      source: 'phone',
      search: '  mia ',
      junk: 'x',
    })
    expect(f).toEqual({
      window: 'past_30d',
      attention: ['no_show', 'unconfirmed'],
      providerId: 'prov_1',
      source: 'phone',
      search: 'mia',
    })
  })

  it('drops an invalid window + empty attention array', () => {
    const f = normalizeAppointmentViewFilters({ window: 'nope', attention: ['zzz'] })
    expect(f.window).toBeUndefined()
    expect(f.attention).toBeUndefined()
  })
})

describe('isEmptyAppointmentViewFilters', () => {
  it('treats the default window with nothing else as empty', () => {
    expect(isEmptyAppointmentViewFilters({})).toBe(true)
    expect(isEmptyAppointmentViewFilters({ window: 'next_14d' })).toBe(true)
  })
  it('is non-empty once a real constraint is set', () => {
    expect(isEmptyAppointmentViewFilters({ window: 'past_30d' })).toBe(false)
    expect(isEmptyAppointmentViewFilters({ attention: ['no_show'] })).toBe(false)
    expect(isEmptyAppointmentViewFilters({ providerId: 'p1' })).toBe(false)
    expect(isEmptyAppointmentViewFilters({ search: 'mia' })).toBe(false)
  })
})

describe('appointmentViewFiltersToQuery', () => {
  it('round-trips into agenda query params (dropping the default window)', () => {
    const q = appointmentViewFiltersToQuery({
      window: 'this_week',
      attention: ['unconfirmed', 'no_show'],
      providerId: 'prov_1',
      source: 'portal',
      search: 'mia',
    })
    const p = new URLSearchParams(q)
    expect(p.get('window')).toBe('this_week')
    expect(p.get('attention')).toBe('unconfirmed,no_show')
    expect(p.get('provider')).toBe('prov_1')
    expect(p.get('source')).toBe('portal')
    expect(p.get('q')).toBe('mia')
  })
  it('omits the default window so it matches a bare list URL', () => {
    expect(appointmentViewFiltersToQuery({ window: 'next_14d' })).toBe('')
    expect(appointmentViewFiltersToQuery({ window: 'next_14d', attention: ['no_show'] })).toBe('attention=no_show')
  })
})

describe('describeAppointmentViewFilters', () => {
  it('summarizes window + attention + provider name', () => {
    const desc = describeAppointmentViewFilters(
      { window: 'this_week', attention: ['unconfirmed'], providerId: 'p1' },
      new Map([['p1', 'Dr. Reyes']]),
    )
    expect(desc).toContain('This week')
    expect(desc).toContain('unconfirmed')
    expect(desc).toContain('Dr. Reyes')
  })
  it('falls back to "All appointments" when empty/default', () => {
    expect(describeAppointmentViewFilters({})).toBe('All appointments')
    expect(describeAppointmentViewFilters({ window: 'next_14d' })).toBe('All appointments')
  })
})
