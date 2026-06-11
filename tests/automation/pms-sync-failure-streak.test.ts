import { describe, it, expect, vi } from 'vitest'

// The route imports db + services at module load; keep those inert so we can
// exercise the pure failure-streak helpers without a DB / network.
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/services/pms/sync', () => ({ runImport: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))

import { consecutiveFailuresFrom, shouldAlertForFailureStreak } from '@/app/api/cron/pms-sync/route'

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
