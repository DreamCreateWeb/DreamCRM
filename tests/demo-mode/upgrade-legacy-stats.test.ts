/**
 * Unit tests for the demo self-heal that converts the legacy hardcoded
 * "8,000+ five-star reviews" stat into the live-count dynamic stat. Runs
 * every time a platform admin enters demo mode against a legacy seed.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock the db before the demo-clinic import. The helper under test is
// pure so the db mock is never exercised; this just satisfies the
// import-time side effects.
vi.mock('@/lib/db', () => ({
  db: { select: () => ({}), insert: () => ({}), update: () => ({}) },
  schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }),
}))

import { upgradeLegacyDemoStats } from '@/lib/services/demo-clinic'
import type { ClinicStat } from '@/lib/types/clinic-content'

describe('upgradeLegacyDemoStats', () => {
  it('returns null when stats is null (no legacy stats to upgrade)', () => {
    expect(upgradeLegacyDemoStats(null)).toBeNull()
  })

  it('returns null when stats are already on the current dynamic shape', () => {
    const current: ClinicStat[] = [
      { id: 'st_reviews', value: '0', label: 'happy patients', dynamic: 'review_count' },
      { id: 'st2', value: 'Same-week', label: 'appointments' },
    ]
    expect(upgradeLegacyDemoStats(current)).toBeNull()
  })

  it('upgrades the legacy stat recognized by id st1', () => {
    const legacy: ClinicStat[] = [
      { id: 'st1', value: '8,000+', label: 'five-star reviews' },
      { id: 'st2', value: 'Same-week', label: 'appointments' },
    ]
    const upgraded = upgradeLegacyDemoStats(legacy)
    expect(upgraded).not.toBeNull()
    expect(upgraded![0]).toEqual({
      id: 'st_reviews',
      value: '0',
      label: 'happy patients',
      dynamic: 'review_count',
    })
    // Other stats are preserved
    expect(upgraded![1]).toEqual({ id: 'st2', value: 'Same-week', label: 'appointments' })
  })

  it('recognizes the legacy stat by its "8,000+" value even if the id was renamed', () => {
    const legacy: ClinicStat[] = [
      { id: 'custom_id', value: '8,000+', label: 'five-star reviews' },
    ]
    const upgraded = upgradeLegacyDemoStats(legacy)
    expect(upgraded![0].dynamic).toBe('review_count')
  })

  it('recognizes the legacy stat by its "five-star reviews" label', () => {
    const legacy: ClinicStat[] = [
      { id: 'whatever', value: '12,345', label: 'five-star reviews' },
    ]
    const upgraded = upgradeLegacyDemoStats(legacy)
    expect(upgraded![0].dynamic).toBe('review_count')
  })

  it('leaves hand-edited stats alone (no legacy markers — id renamed, value + label edited)', () => {
    const handEdited: ClinicStat[] = [
      { id: 'custom', value: '500', label: 'patients served' }, // no legacy id, no 8,000+, no "five-star reviews" label
      { id: 'st2', value: 'Same-week', label: 'appointments' },
    ]
    expect(upgradeLegacyDemoStats(handEdited)).toBeNull()
  })

  it('does NOT re-upgrade a stat that already carries dynamic: review_count', () => {
    // Edge case: a stat that happens to have id="st1" but is already
    // dynamic shouldn't be touched.
    const mixed: ClinicStat[] = [
      { id: 'st1', value: '0', label: 'happy patients', dynamic: 'review_count' },
    ]
    expect(upgradeLegacyDemoStats(mixed)).toBeNull()
  })
})
