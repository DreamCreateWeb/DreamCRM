import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isWithinOfficeHours } from '@/lib/clinic-timezone'
import { resolvePortalSettings, DEFAULT_AUTO_REPLY_MESSAGE } from '@/lib/types/portal'

/**
 * After-hours auto-reply: the timezone-aware office-hours check that gates
 * it, the portal-settings parsing for the autoReply block, and (round-2
 * audit) the EXECUTED send path — the message write, the org-scoped name
 * lookup, and the auto_reply Action Ledger entry.
 */

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  recordAction: vi.fn(async (..._a: unknown[]) => true),
}))

vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.where = () => o
    o.limit = async () => h.selectQueue.shift() ?? []
    return o
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async (v: Record<string, unknown>) => { h.inserts.push(v) } }),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => { h.updates.push(s) } }) }),
    },
    schema: {
      clinicProfile: { organizationId: 'org', displayName: 'displayName', hours: 'hours', timezone: 'timezone', portalSettings: 'portalSettings' },
      patientMessage: { id: 'id', threadId: 'threadId', direction: 'direction', sentAt: 'sentAt', meta: 'meta' },
      patientThread: { id: 'id' },
      patient: { organizationId: 'org', id: 'id', firstName: 'firstName' },
    },
  }
})
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: h.recordAction }))
vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => ({ name: 'Acme', from: 'a@x.com', replyTo: null, gmail: null })) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  asc: vi.fn((x) => x),
  count: vi.fn(() => ({ _: 'count' })),
  desc: vi.fn((x) => x),
  eq: vi.fn(() => ({ _: 'eq' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  ilike: vi.fn(() => ({ _: 'ilike' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  or: vi.fn(() => ({ _: 'or' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

// A standard Mon–Fri 9–5 week, Sat/Sun closed.
const WEEK = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
  sat: { closed: true },
  sun: { closed: true },
}

// Helper: a UTC instant. We pass an explicit timezone so the check resolves
// clinic-local wall-clock regardless of where the test runs.
const at = (iso: string) => new Date(iso)

describe('isWithinOfficeHours', () => {
  it('is open midday on a weekday (clinic timezone)', () => {
    // 2026-06-23 is a Tuesday. 15:00 UTC = 11:00 America/New_York (EDT) → open.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(true)
  })

  it('is closed late evening on a weekday', () => {
    // 02:00 UTC Wed = 22:00 Tue New York → after 17:00 → closed.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-24T02:00:00Z'))).toBe(false)
  })

  it('is closed before opening', () => {
    // 12:00 UTC = 08:00 New York → before 09:00 → closed.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-23T12:00:00Z'))).toBe(false)
  })

  it('is closed on a closed day (Sunday)', () => {
    // 2026-06-21 is a Sunday; 15:00 UTC = 11:00 NY but sun is closed.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-21T15:00:00Z'))).toBe(false)
  })

  it('respects the timezone — same instant differs by zone', () => {
    // 23:30 UTC Tue = 19:30 NY (closed) but 16:30 LA (open, before 17:00).
    const inst = at('2026-06-23T23:30:00Z')
    expect(isWithinOfficeHours(WEEK, 'America/New_York', inst)).toBe(false)
    expect(isWithinOfficeHours(WEEK, 'America/Los_Angeles', inst)).toBe(true)
  })

  it('returns false for null/malformed hours', () => {
    expect(isWithinOfficeHours(null, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(false)
    expect(isWithinOfficeHours({ tue: { open: 'bad', close: '17:00' } }, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(false)
  })

  it('treats an inverted window (close <= open) as closed', () => {
    expect(isWithinOfficeHours({ tue: { open: '17:00', close: '09:00' } }, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(false)
  })
})

describe('resolvePortalSettings — autoReply', () => {
  it('defaults to disabled with a null (built-in) message', () => {
    const s = resolvePortalSettings({})
    expect(s.autoReply).toEqual({ enabled: false, message: null })
  })

  it('parses an enabled auto-reply with a custom message', () => {
    const s = resolvePortalSettings({ autoReply: { enabled: true, message: 'We are closed — back at 8am.' } })
    expect(s.autoReply.enabled).toBe(true)
    expect(s.autoReply.message).toBe('We are closed — back at 8am.')
  })

  it('coerces a blank custom message to null (use the default)', () => {
    const s = resolvePortalSettings({ autoReply: { enabled: true, message: '   ' } })
    expect(s.autoReply.message).toBeNull()
  })

  it('ignores junk values', () => {
    const s = resolvePortalSettings({ autoReply: { enabled: 'yes', message: 42 } })
    expect(s.autoReply).toEqual({ enabled: false, message: null })
  })

  it('ships a usable default message with the {clinic} token', () => {
    expect(DEFAULT_AUTO_REPLY_MESSAGE).toContain('{clinic}')
  })
})

// ── The EXECUTED send path (round-2 audit: the auto_reply writer was unpinned) ─
import { maybeSendAfterHoursAutoReply } from '@/lib/services/patient-messaging'

// All-closed hours make "after hours" true at any wall-clock time.
const CLOSED_WEEK = {
  mon: { closed: true }, tue: { closed: true }, wed: { closed: true },
  thu: { closed: true }, fri: { closed: true }, sat: { closed: true }, sun: { closed: true },
}
const OPEN_CLINIC = (over: Record<string, unknown> = {}) => ({
  displayName: 'Acme Dental',
  hours: CLOSED_WEEK,
  timezone: 'America/New_York',
  portalSettings: { autoReply: { enabled: true, message: null } },
  ...over,
})

describe('maybeSendAfterHoursAutoReply — executed', () => {
  beforeEach(() => {
    h.selectQueue = []
    h.inserts = []
    h.updates = []
    h.recordAction.mockClear()
  })

  it('sends ONE ack, leaves the clinic unread untouched, and records auto_reply in the ledger', async () => {
    h.selectQueue.push([OPEN_CLINIC()]) // clinic profile
    h.selectQueue.push([]) // no recent auto-reply on the thread
    h.selectQueue.push([{ firstName: 'Mia' }]) // org-scoped patient name lookup
    await maybeSendAfterHoursAutoReply('org_1', 'pat_1', 'thr_1')

    const msg = h.inserts.find((i) => (i.meta as { autoReply?: boolean })?.autoReply)
    expect(msg).toBeTruthy()
    expect(msg!.direction).toBe('outbound')
    expect(String(msg!.body)).toContain('Acme Dental') // {clinic} token resolved
    // The thread preview updates but the unread counter is NOT cleared —
    // the front desk still owes a real reply.
    expect(h.updates.some((u) => 'lastMessageAt' in u)).toBe(true)
    expect(h.updates.some((u) => 'unreadCountForClinic' in u)).toBe(false)

    expect(h.recordAction).toHaveBeenCalledTimes(1)
    const entry = h.recordAction.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('auto_reply')
    expect(entry.organizationId).toBe('org_1')
    expect(entry.patientId).toBe('pat_1')
    expect(entry.summary).toContain('Mia')
  })

  it('a disabled auto-reply sends nothing and claims nothing', async () => {
    h.selectQueue.push([OPEN_CLINIC({ portalSettings: { autoReply: { enabled: false } } })])
    await maybeSendAfterHoursAutoReply('org_1', 'pat_1', 'thr_1')
    expect(h.inserts).toHaveLength(0)
    expect(h.recordAction).not.toHaveBeenCalled()
  })

  it('the dedup window suppresses a second ack AND its ledger claim', async () => {
    h.selectQueue.push([OPEN_CLINIC()])
    h.selectQueue.push([{ id: 'pm_recent' }]) // an auto-reply already went out
    await maybeSendAfterHoursAutoReply('org_1', 'pat_1', 'thr_1')
    expect(h.inserts).toHaveLength(0)
    expect(h.recordAction).not.toHaveBeenCalled()
  })
})
