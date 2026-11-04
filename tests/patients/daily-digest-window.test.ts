import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/email', () => ({ sendStaffDigestEmail: vi.fn(), sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/my-day', () => ({ getMyDay: vi.fn() }))
vi.mock('@/lib/services/site-analytics', () => ({ getWeeklySiteDigest: vi.fn() }))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), ne: vi.fn() }))
vi.mock('@/lib/services/action-ledger', () => ({ countActionsSince: vi.fn(), countFailuresSince: vi.fn() }))
vi.mock('@/lib/services/proposals', () => ({ listOpenProposalsOnYou: vi.fn() }))
vi.mock('@/lib/services/readiness', () => ({ getReadinessReport: vi.fn() }))
vi.mock('@/lib/services/first-week', () => ({ listPendingOnUs: vi.fn(), readMergedActivation: vi.fn() }))

import { buildDigestContent, digestWindow } from '@/lib/services/daily-digest'
import type { MyDayData } from '@/lib/services/my-day'

const t = (iso: string) => new Date(iso)

describe('digestWindow, the clinic-local morning (ML-33)', () => {
  it('a Pacific clinic at 13:00 UTC (5 AM there) is not due; at 15:00 UTC (7 AM) it is', () => {
    expect(digestWindow(t('2026-11-04T13:00:00Z'), 'America/Los_Angeles').open).toBe(false)
    expect(digestWindow(t('2026-11-04T15:00:00Z'), 'America/Los_Angeles').open).toBe(true)
  })
  it('an Eastern clinic opens at 12:00 UTC (7 AM EST)', () => {
    expect(digestWindow(t('2026-11-04T11:00:00Z'), 'America/New_York').open).toBe(false)
    expect(digestWindow(t('2026-11-04T12:00:00Z'), 'America/New_York').open).toBe(true)
  })
  it('keys the day by the clinic-local date, not the UTC date', () => {
    expect(digestWindow(t('2026-11-05T03:00:00Z'), 'America/Los_Angeles').day).toBe('2026-11-04')
  })
  it('two ticks the same local day share one day key (the second is a no-op downstream)', () => {
    const a = digestWindow(t('2026-11-04T15:05:00Z'), 'America/Los_Angeles')
    const b = digestWindow(t('2026-11-04T16:05:00Z'), 'America/Los_Angeles')
    expect(a.day).toBe(b.day)
  })
})

describe('digest structure for the staff email', () => {
  it('carries sections, the One Thing and the closing as structure', () => {
    const data = {
      followups: { overdue: 0, today: 0, items: [] },
      conversations: [],
      todaysAppointments: [],
      unconfirmedTodayCount: 2,
      newLeadsCount: 0,
      balances: { count: 0, totalCents: 0 },
      pmsLink: { kind: 'connected' },
      openProposalsCount: 0,
      tomorrow: { dayKey: '2026-06-16', visitCount: 0, items: [] },
    } as unknown as MyDayData
    const c = buildDigestContent(data, 'Dream Dental', null, {
      happened: 'I sent 3 reminders.',
      oneThing: { text: 'Approve the recall card', href: '/dream-team', kind: 'card' },
      sendsAlone: false,
    } as never)
    expect(c.oneThing).toBe('Approve the recall card')
    expect(c.oneThingHref).toBe('/dream-team')
    expect(c.sections.map((s) => s.heading)).toContain('Visits to confirm')
  })
})
