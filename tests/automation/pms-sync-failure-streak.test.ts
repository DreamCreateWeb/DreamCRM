import { describe, it, expect, vi } from 'vitest'

// The route imports db + services at module load; keep those inert so we can
// exercise the pure failure-streak helpers without a DB / network.
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/services/pms/sync', () => ({ runImport: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))

import {
  consecutiveFailuresFrom,
  shouldAlertForFailureStreak,
  shouldSkipForCadence,
} from '@/app/api/cron/pms-sync/route'

describe('consecutiveFailuresFrom — counts failures from most-recent backwards', () => {
  it('counts a leading run of error/partial then stops at the first success', () => {
    expect(consecutiveFailuresFrom([{ status: 'error' }, { status: 'success' }])).toBe(1)
    expect(consecutiveFailuresFrom([{ status: 'partial' }, { status: 'error' }, { status: 'success' }])).toBe(2)
    expect(consecutiveFailuresFrom([{ status: 'error' }, { status: 'error' }, { status: 'error' }])).toBe(3)
  })

  it('returns 0 when the latest run succeeded', () => {
    expect(consecutiveFailuresFrom([{ status: 'success' }, { status: 'error' }])).toBe(0)
    expect(consecutiveFailuresFrom([])).toBe(0)
  })
})

describe('shouldAlertForFailureStreak — alert only at streak start + at the repeated-failure threshold', () => {
  it('alerts on the FIRST failure after a good run (streak start = 1)', () => {
    expect(shouldAlertForFailureStreak(1)).toBe(true)
  })

  it('stays quiet on the 2nd consecutive failure (avoids hourly spam)', () => {
    expect(shouldAlertForFailureStreak(2)).toBe(false)
  })

  it('alerts again at exactly the 3rd consecutive failure (repeated_failure threshold)', () => {
    expect(shouldAlertForFailureStreak(3)).toBe(true)
  })

  it('stays quiet from the 4th failure onward', () => {
    expect(shouldAlertForFailureStreak(4)).toBe(false)
    expect(shouldAlertForFailureStreak(5)).toBe(false)
  })

  it('does not alert when there is no failure streak (0)', () => {
    expect(shouldAlertForFailureStreak(0)).toBe(false)
  })
})

describe('shouldSkipForCadence — NexHealth runs every OTHER hourly tick (metered calls)', () => {
  const now = new Date('2026-08-10T12:00:00Z')
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000)

  it('skips a nexhealth org whose last sync landed under 105 minutes ago', () => {
    expect(shouldSkipForCadence('nexhealth', minutesAgo(60), now)).toBe(true)
    expect(shouldSkipForCadence('nexhealth', minutesAgo(104), now)).toBe(true)
  })

  it('runs a nexhealth org once the last sync is 105+ minutes old', () => {
    expect(shouldSkipForCadence('nexhealth', minutesAgo(105), now)).toBe(false)
    expect(shouldSkipForCadence('nexhealth', minutesAgo(180), now)).toBe(false)
  })

  it('never gates a never-synced nexhealth org (cold start runs immediately)', () => {
    expect(shouldSkipForCadence('nexhealth', null, now)).toBe(false)
  })

  it('never gates Open Dental or the demo provider (their calls are free)', () => {
    expect(shouldSkipForCadence('open_dental', minutesAgo(5), now)).toBe(false)
    expect(shouldSkipForCadence('demo', minutesAgo(5), now)).toBe(false)
  })
})
