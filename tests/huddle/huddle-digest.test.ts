import { describe, it, expect, vi } from 'vitest'

// buildDigestContent is pure but lives in a server module that imports the
// email layer + db at load; stub those so the import is side-effect-free
// (the same stubs as tests/digest/closures-digest.test.ts).
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
import type { MyDayData } from '@/lib/services/my-day'

/**
 * THE HUDDLE in the morning email (docs/daily-tools.md, H1). "That email is
 * the app" (docs/ACTIVATION.md) — so the Huddle's one-line read of today
 * rides it, for the person who missed the meeting or never has one.
 */

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
    tomorrow: { dayKey: '2026-11-26', visitCount: 0, items: [] },
    ...over,
  }
}

const LINE = '12 visits today — 3 need a little prep.'

describe('the digest and the Huddle', () => {
  it('a day with patients in it is worth the email on its own, and the line names the page', () => {
    const c = buildDigestContent(data(), 'Dream Dental', null, null, null, null, LINE)
    expect(c.hasContent).toBe(true)
    expect(c.body).toContain(`☀️ ${LINE} The whole day, patient by patient, is on your Huddle page.`)
    expect(c.sections.find((s) => s.heading === 'Today’s huddle')?.lines).toEqual([`${LINE} The whole day, patient by patient, is on your Huddle page.`])
    expect(c.body).not.toContain('all caught up')
  })

  it('leads the to-dos — the day first, then what is waiting on you', () => {
    const c = buildDigestContent(data({ unconfirmedTodayCount: 2 }), 'Dream Dental', null, null, null, null, LINE)
    expect(c.body.indexOf('☀️')).toBeGreaterThan(-1)
    expect(c.body.indexOf('☀️')).toBeLessThan(c.body.indexOf('📅'))
    expect(c.sections[0].heading).toBe('Today’s huddle')
  })

  it('says nothing while the door is closed or the day is empty (null), and the email is exactly what it was', () => {
    const before = buildDigestContent(data({ unconfirmedTodayCount: 2 }), 'Dream Dental', null, null, null, null)
    const withNull = buildDigestContent(data({ unconfirmedTodayCount: 2 }), 'Dream Dental', null, null, null, null, null)
    expect(withNull).toEqual(before)
    expect(before.body).not.toContain('Huddle')
    // …and an otherwise quiet person is still left alone.
    expect(buildDigestContent(data(), 'Dream Dental', null, null, null, null, null).hasContent).toBe(false)
  })
})
