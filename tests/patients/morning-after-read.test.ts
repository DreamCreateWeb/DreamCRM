import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * readMorningAfter's SERVICE half (verification round 2's test gap): the
 * clinic row's `doors_closed` reaches the pure builder as `doorsClosed`,
 * so the one thing never sends staff through a door a person closed; a
 * failed row read leaves it undefined (unknown), never "all open".
 */
const state = { profile: [] as Array<Record<string, unknown>>, profileThrows: false }
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => {
      if (state.profileThrows) throw new Error('db down')
      return state.profile
    }
    return obj
  }
  return { schema, db: { select: () => chain() } }
})
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/my-day', () => ({ getMyDay: vi.fn() }))
vi.mock('@/lib/services/site-analytics', () => ({ getWeeklySiteDigest: vi.fn() }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn() }))
vi.mock('@/lib/services/action-ledger', () => ({ countActionsSince: async () => ({}), countFailuresSince: async () => 0 }))
vi.mock('@/lib/services/proposals', () => ({ listOpenProposalsOnYou: async () => [], countOpenProposals: async () => 0 }))
vi.mock('@/lib/services/readiness', () => ({ getReadinessReport: async () => ({ attention: [] }) }))
vi.mock('@/lib/services/feature-switches', () => ({ getFeatureSwitchState: async () => ({}) }))
const ALL_BUT_A5 = { a1: new Date('2026-10-01'), a2: new Date('2026-10-02'), a3: new Date('2026-10-03'), a4: new Date('2026-10-04'), a5: null }
vi.mock('@/lib/services/first-week', () => ({ listPendingOnUs: async () => [], readMergedActivation: async () => ALL_BUT_A5 }))

import { readMorningAfter } from '@/lib/services/daily-digest'
import { ACTIVATION_DOORS } from '@/lib/morning-after'

const NOW = new Date('2026-10-12T15:00:00Z')
const CREATED = new Date('2026-10-10T15:00:00Z')

beforeEach(() => {
  state.profile = []
  state.profileThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('readMorningAfter and the close memory', () => {
  it('the next door is the one thing while its module is open', async () => {
    state.profile = [{ siteLiveAt: new Date('2026-10-10'), doorsClosed: null }]
    const m = await readMorningAfter('org_a', CREATED, NOW)
    expect(m?.oneThing).toEqual({ kind: 'activation', text: ACTIVATION_DOORS.a5.text, href: ACTIVATION_DOORS.a5.href })
  })

  it('a door a person closed is never the one thing (doors_closed reaches the builder)', async () => {
    state.profile = [{ siteLiveAt: new Date('2026-10-10'), doorsClosed: { intake_forms: '2026-10-11T00:00:00.000Z' } }]
    const m = await readMorningAfter('org_a', CREATED, NOW)
    expect(m?.oneThing).toBeNull()
  })

  it('an unread profile row leaves the doors unknown — the door is still offered, never treated as closed', async () => {
    state.profileThrows = true
    const m = await readMorningAfter('org_a', CREATED, NOW)
    expect(m?.oneThing?.href).toBe(ACTIVATION_DOORS.a5.href)
  })
})
