import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Subscribable calendar feed service: token generate/read + the .ics builder
 * that resolves an org BY the opaque token and serializes its agenda.
 */

const state = { selectQueue: [] as unknown[][], updates: [] as Record<string, unknown>[] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy']) o[m] = () => o
    o.limit = async () => state.selectQueue.shift() ?? []
    o.then = (r: (v: unknown) => void) => r(state.selectQueue.shift() ?? [])
    return o
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => { state.updates.push(s) } }) }),
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  notInArray: vi.fn(() => ({})),
  // schema modules evaluate `sql` at load time (jsonb column defaults).
  sql: vi.fn(() => ({})),
}))

import {
  buildClinicCalendarFeed,
  generateCalendarFeedToken,
  getCalendarFeedToken,
  clearCalendarFeedToken,
} from '@/lib/services/calendar-feed'

const CLINIC = {
  organizationId: 'org_1',
  displayName: 'Dream Dental',
  addressLine1: '500 Main St',
  addressLine2: null,
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
}

function appt(over: Record<string, unknown> = {}) {
  return {
    id: 'appt_1',
    startTime: new Date('2026-02-01T15:00:00.000Z'),
    endTime: new Date('2026-02-01T15:30:00.000Z'),
    type: 'cleaning',
    notes: null,
    patientFirst: 'Mia',
    patientLast: 'Hayes',
    providerName: 'Dr. Reyes',
    ...over,
  }
}

beforeEach(() => {
  state.selectQueue.length = 0
  state.updates.length = 0
})

describe('generateCalendarFeedToken', () => {
  it('writes a long random token and returns it', async () => {
    const token = await generateCalendarFeedToken('org_1')
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    expect(state.updates[0].calendarFeedToken).toBe(token)
  })
})

describe('getCalendarFeedToken / clearCalendarFeedToken', () => {
  it('reads the stored token', async () => {
    state.selectQueue.push([{ token: 'abc123' }])
    expect(await getCalendarFeedToken('org_1')).toBe('abc123')
  })
  it('returns null when off', async () => {
    state.selectQueue.push([])
    expect(await getCalendarFeedToken('org_1')).toBeNull()
  })
  it('clears the token', async () => {
    await clearCalendarFeedToken('org_1')
    expect(state.updates[0].calendarFeedToken).toBeNull()
  })
})

describe('buildClinicCalendarFeed', () => {
  const TOKEN = 'demo-dream-dental-calendar-feed-7c3f9a2e1b'

  it('returns null for a too-short token (never touches the db)', async () => {
    expect(await buildClinicCalendarFeed('short')).toBeNull()
    expect(state.selectQueue.length).toBe(0) // nothing consumed
  })

  it('returns null for an unknown token', async () => {
    state.selectQueue.push([]) // clinic lookup → no row
    expect(await buildClinicCalendarFeed(TOKEN)).toBeNull()
  })

  it('builds a named feed with an event per appointment', async () => {
    state.selectQueue.push([CLINIC]) // clinic lookup
    state.selectQueue.push([appt(), appt({ id: 'appt_2', type: 'checkup', patientFirst: 'Liam', patientLast: 'Reyes' })]) // appointments
    const feed = await buildClinicCalendarFeed(TOKEN)
    expect(feed).not.toBeNull()
    expect(feed!.calendarName).toBe('Dream Dental — Appointments')
    expect(feed!.filename).toBe('dreamcrm-appointments.ics')
    expect(feed!.ics.match(/BEGIN:VEVENT/g) ?? []).toHaveLength(2)
    expect(feed!.ics).toContain('SUMMARY:Cleaning · Mia Hayes')
    expect(feed!.ics).toContain('SUMMARY:Checkup · Liam Reyes')
    // Provider lands in the description; clinic address as the location.
    expect(feed!.ics).toContain('DESCRIPTION:Provider: Dr. Reyes')
    expect(feed!.ics).toContain('LOCATION:500 Main St\\, Austin\\, TX\\, 78701')
    // Stable UID so a re-fetch updates rather than duplicates.
    expect(feed!.ics).toContain('UID:appt-appt_1@dreamcreatestudio.com')
  })

  it('defaults a missing endTime to start + 30 min', async () => {
    state.selectQueue.push([CLINIC])
    state.selectQueue.push([appt({ endTime: null })])
    const feed = await buildClinicCalendarFeed(TOKEN)
    expect(feed!.ics).toContain('DTSTART:20260201T150000Z')
    expect(feed!.ics).toContain('DTEND:20260201T153000Z')
  })
})
