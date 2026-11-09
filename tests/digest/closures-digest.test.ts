import { describe, it, expect, vi } from 'vitest'

// buildDigestContent is pure but lives in a server module that imports the
// email layer + db at load; stub those so the import is side-effect-free
// (same stubs as tests/patients/daily-digest.test.ts).
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/email', () => ({ sendStaffDigestEmail: vi.fn(), sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/my-day', () => ({ getMyDay: vi.fn() }))
vi.mock('@/lib/services/site-analytics', () => ({ getWeeklySiteDigest: vi.fn() }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn() }))
vi.mock('@/lib/services/closures', () => ({ listClosures: vi.fn() }))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), ne: vi.fn() }))
vi.mock('@/lib/services/action-ledger', () => ({ countActionsSince: vi.fn(), countFailuresSince: vi.fn() }))
vi.mock('@/lib/services/proposals', () => ({ listOpenProposalsOnYou: vi.fn() }))
vi.mock('@/lib/services/readiness', () => ({ getReadinessReport: vi.fn() }))
vi.mock('@/lib/services/first-week', () => ({ listPendingOnUs: vi.fn(), readMergedActivation: vi.fn() }))

import { buildDigestContent } from '@/lib/services/daily-digest'
import { digestClosureNotes } from '@/lib/closures'
import type { MyDayData } from '@/lib/services/my-day'

function data(over: Partial<MyDayData> = {}): MyDayData {
  return {
    followups: { overdue: 0, today: 0, items: [] },
    conversations: [],
    todaysAppointments: [],
    unconfirmedTodayCount: 0,
    newLeadsCount: 0,
    balances: { count: 0, totalCents: 0 },
    pmsLink: { kind: 'connected' },
    openProposalsCount: 0,
    tomorrow: { dayKey: '2026-11-24', visitCount: 0, items: [] },
    ...over,
  }
}

const THANKS = { id: 'c1', startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' }

describe('the digest and closures (ML-51)', () => {
  it('the Monday before a closure names it, and that alone justifies the email', () => {
    const notes = digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-23', isMonday: true, bookedOnClosure: 1 })
    const c = buildDigestContent(data(), 'Dream Dental', null, null, null, notes)
    expect(c.hasContent).toBe(true)
    expect(c.body).toContain('Closed this week: Thanksgiving (Nov 26–27)')
    expect(c.body).toContain('1 visit is still booked')
    expect(c.sections.some((s) => s.heading === 'Closed this week')).toBe(true)
    // Not "all caught up" — the closure is the news.
    expect(c.body).not.toContain('all caught up')
  })

  it('a mid-week digest does not repeat it (the heads-up is named once)', () => {
    const notes = digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-24', isMonday: false })
    const c = buildDigestContent(data(), 'Dream Dental', null, null, null, notes)
    expect(c.hasContent).toBe(false)
    expect(c.body).not.toContain('Thanksgiving')
  })

  it('a closed day is not read as a quiet one — the closing says why', () => {
    const notes = digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-26', isMonday: false })
    const c = buildDigestContent(data({ unconfirmedTodayCount: 1 }), 'Dream Dental', null, null, null, notes)
    expect(c.closing).toContain('closed today for Thanksgiving')
    expect(c.body).not.toContain('all caught up')
  })

  it('without closures the digest is unchanged', () => {
    const c = buildDigestContent(data(), 'Dream Dental')
    expect(c.body).toContain('all caught up')
  })
})
