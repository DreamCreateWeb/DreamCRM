import { describe, it, expect, vi } from 'vitest'

// buildDigestContent is pure but lives in a server module that imports the email
// layer + db at load; stub those so the import is side-effect-free.
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/my-day', () => ({ getMyDay: vi.fn() }))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), ne: vi.fn() }))

import { buildDigestContent } from '@/lib/services/daily-digest'
import type { MyDayData } from '@/lib/services/my-day'

function data(over: Partial<MyDayData> = {}): MyDayData {
  return {
    followups: { overdue: 0, today: 0, items: [] },
    conversations: [],
    todaysAppointments: [],
    newLeadsCount: 0,
    ...over,
  }
}
function appt(status: string) {
  return { id: 'a', status, startTime: new Date(), type: 'cleaning', patientName: 'X', patientId: 'p' } as never
}
function fu(title: string, dueDate: string | null) {
  return { id: 'f', patientId: 'p', patientName: 'Mia Hayes', title, dueDate, assignedUserId: null, assigneeName: null, status: 'open', createdByName: null, completedAt: null, createdAt: new Date() } as never
}

describe('buildDigestContent', () => {
  it('is quiet (no content) when there is nothing to do', () => {
    const c = buildDigestContent(data(), 'Dream Dental')
    expect(c.hasContent).toBe(false)
    expect(c.subject).toBe('Your day at Dream Dental')
    expect(c.body).toContain('all caught up')
  })

  it('summarizes follow-ups (with overdue), confirmations + leads in the subject', () => {
    const c = buildDigestContent(
      data({
        followups: { overdue: 2, today: 1, items: [fu('Call Mia', '2026-06-15')] },
        todaysAppointments: [appt('scheduled'), appt('confirmed')],
        newLeadsCount: 1,
      }),
      'Dream Dental',
    )
    expect(c.hasContent).toBe(true)
    expect(c.subject).toBe('Your day: 3 follow-ups, 1 to confirm, 1 new lead')
    expect(c.body).toContain('3 follow-ups due (2 overdue)')
    expect(c.body).toContain('Call Mia')
    expect(c.body).toContain('1 visit') // unconfirmed = the one scheduled
    expect(c.body).toContain('1 new website lead')
  })

  it('does not add a greeting (the email shell adds it)', () => {
    const c = buildDigestContent(data({ newLeadsCount: 2 }), 'Dream Dental')
    expect(c.body.startsWith('Hi ')).toBe(false)
  })
})
