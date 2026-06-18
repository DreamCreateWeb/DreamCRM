import { describe, it, expect } from 'vitest'
import {
  normalizeViewFilters,
  isEmptyViewFilters,
  viewFiltersToQuery,
  describeViewFilters,
} from '@/lib/types/patient-views'
import { patientFiltersToAudienceFilter } from '@/lib/services/patient-views'

describe('normalizeViewFilters', () => {
  it('keeps recognized non-empty fields and drops the rest', () => {
    const f = normalizeViewFilters({
      status: 'recall_due',
      hasBalance: true,
      missingIntake: false,
      sources: ['booking', ''],
      tagIds: ['t1'],
      search: '  mia ',
      junk: 'ignored',
    })
    expect(f).toEqual({
      status: 'recall_due',
      hasBalance: true,
      sources: ['booking'],
      tagIds: ['t1'],
      search: 'mia',
    })
  })

  it('drops status="all" (it carries no constraint)', () => {
    expect(normalizeViewFilters({ status: 'all' }).status).toBeUndefined()
  })
})

describe('isEmptyViewFilters', () => {
  it('is true for no constraints, false once any is set', () => {
    expect(isEmptyViewFilters({})).toBe(true)
    expect(isEmptyViewFilters({ status: 'all' })).toBe(true)
    expect(isEmptyViewFilters({ hasBalance: true })).toBe(false)
    expect(isEmptyViewFilters({ tagIds: ['t1'] })).toBe(false)
  })
})

describe('viewFiltersToQuery', () => {
  it('round-trips the filter shape into list query params', () => {
    const q = viewFiltersToQuery({ status: 'recall_due', hasBalance: true, tagIds: ['a', 'b'], search: 'mia' })
    const p = new URLSearchParams(q)
    expect(p.get('status')).toBe('recall_due')
    expect(p.get('balance')).toBe('1')
    expect(p.get('tags')).toBe('a,b')
    expect(p.get('q')).toBe('mia')
  })
  it('emits nothing for an empty/all view', () => {
    expect(viewFiltersToQuery({ status: 'all' })).toBe('')
  })
})

describe('describeViewFilters', () => {
  it('resolves tag ids to names when a map is given', () => {
    const desc = describeViewFilters({ tagIds: ['t1'], hasBalance: true }, new Map([['t1', 'VIP']]))
    expect(desc).toContain('VIP')
    expect(desc).toContain('has balance')
  })
  it('falls back to "All patients" when empty', () => {
    expect(describeViewFilters({})).toBe('All patients')
  })
})

describe('patientFiltersToAudienceFilter', () => {
  it('maps status / balance / tags / sources onto the audience filter', () => {
    const { filter, dropped } = patientFiltersToAudienceFilter({
      status: 'recall_due',
      hasBalance: true,
      tagIds: ['t1'],
      sources: ['booking'],
    })
    expect(filter.recallStatuses).toEqual(['due', 'overdue'])
    expect(filter.hasOutstandingBalance).toBe(true)
    expect(filter.tagIds).toEqual(['t1'])
    expect(filter.sources).toEqual(['booking'])
    expect(filter.requireEmailOptIn).toBe(true)
    expect(dropped).toEqual([])
  })

  it('maps lifecycle statuses + archived include flag', () => {
    expect(patientFiltersToAudienceFilter({ status: 'new' }).filter.lifecycles).toEqual(['new'])
    expect(patientFiltersToAudienceFilter({ status: 'inactive' }).filter.lifecycles).toEqual(['lapsed'])
    const arch = patientFiltersToAudienceFilter({ status: 'archived' })
    expect(arch.filter.lifecycles).toEqual(['archived'])
    expect(arch.filter.includeArchived).toBe(true)
  })

  it('reports filters that do not translate to an audience', () => {
    const { dropped } = patientFiltersToAudienceFilter({ missingIntake: true, search: 'mia' })
    expect(dropped).toContain('missing intake')
    expect(dropped).toContain('search text')
  })
})
