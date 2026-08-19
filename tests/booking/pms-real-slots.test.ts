import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * REAL SLOTS (write-back's sibling): a NexHealth-connected clinic's booking
 * surfaces offer THEIR slot engine's open times — the same source the write
 * path validates — so a patient can never book a time the push would
 * refuse. Pinned: the branch decision, the mapping (day-filter, dedupe,
 * sort, clinic-tz labels), the fallbacks (no binding / no providers /
 * budget reached → local engine), the 2-minute cache, and the
 * submit-guard's fresh-read + local-capacity composition.
 */

const { col } = vi.hoisted(() => ({ col: (n: string) => ({ __col: n }) }))

const state = {
  connection: null as Record<string, unknown> | null,
  profile: {
    timezone: 'America/Chicago',
    chairCount: 2,
    hours: {
      mon: { open: '08:00', close: '17:00' }, tue: { open: '08:00', close: '17:00' },
      wed: { open: '08:00', close: '17:00' }, thu: { open: '08:00', close: '17:00' },
      fri: { open: '08:00', close: '17:00' }, sat: null, sun: null,
    },
  } as Record<string, unknown>,
  providerMaps: [] as Array<Record<string, unknown>>,
  appointments: [] as Array<Record<string, unknown>>,
  nexSlots: [] as Array<Record<string, unknown>>,
  nexCalls: 0,
  budgetThrows: false,
}

vi.mock('@/lib/db', () => {
  const select = (cols?: Record<string, unknown>) => {
    let table = ''
    let joined = false
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => ((table = t.__name), api)
    api.innerJoin = () => ((joined = true), api)
    api.where = () => api
    const rows = () => {
      if (table === 'pms_connection') return state.connection ? [state.connection] : []
      if (table === 'clinic_profile') return [state.profile]
      if (table === 'pms_entity_map' && joined) return state.providerMaps
      if (table === 'appointment') return state.appointments
      return []
    }
    const project = (out: Array<Record<string, unknown>>) =>
      cols
        ? out.map((r) => Object.fromEntries(Object.entries(cols).map(([a, c]) => [a, r[(c as { __col: string }).__col]])))
        : out
    api.limit = async (n: number) => project(rows()).slice(0, n)
    ;(api as { then: unknown }).then = (onF: (v: unknown) => unknown) => Promise.resolve(project(rows())).then(onF)
    return api
  }
  return { db: { select, transaction: async () => true } }
})
vi.mock('@/lib/db/schema/clinic', () => ({
  appointment: { __name: 'appointment', organizationId: col('organizationId'), startTime: col('startTime'), endTime: col('endTime'), status: col('status'), id: col('id') },
  clinicProvider: { __name: 'clinic_provider', id: col('id'), isActive: col('isActive') },
  pmsConnection: { __name: 'pms_connection', organizationId: col('organizationId'), provider: col('provider'), status: col('status'), meta: col('meta') },
  pmsEntityMap: { __name: 'pms_entity_map', organizationId: col('organizationId'), entityType: col('entityType'), externalId: col('externalId'), internalId: col('internalId') },
}))
vi.mock('@/lib/db/schema/platform', () => ({
  clinicProfile: { __name: 'clinic_profile', organizationId: col('organizationId'), hours: col('hours'), timezone: col('timezone'), chairCount: col('chairCount') },
}))
vi.mock('drizzle-orm', () => ({
  and: (...p: unknown[]) => p,
  eq: () => true,
  gte: () => true,
  lte: () => true,
  ne: () => true,
  sql: Object.assign(() => '', { raw: () => '' }),
}))
vi.mock('@/lib/nexhealth', () => ({
  listAppointmentSlots: vi.fn(async () => {
    state.nexCalls++
    return state.nexSlots
  }),
}))
vi.mock('@/lib/services/pms/api-meter', () => ({
  assertPmsApiBudget: vi.fn(async () => {
    if (state.budgetThrows) throw new Error('budget reached')
  }),
  recordPmsApiCall: vi.fn(async () => undefined),
}))

import { getBookableSlotsForDay, isBookableSlot } from '@/lib/services/booking'

let ORG = 'org_1'
let orgSeq = 0
const BINDING = {
  provider: 'nexhealth',
  status: 'connected',
  meta: { subdomain: 'sub', locationId: 353605, env: 'sandbox' },
}
// A Wednesday. Clinic tz America/Chicago; practice slots arrive with -04:00
// offsets (Eastern practice) — 10:00 ET = 09:00 CT, still Wednesday.
const DAY = '2026-08-19'

// FREEZE Date only (timers/promises stay real): the engine drops slots in the
// past against the REAL clock, so the fixture's hardcoded morning went stale
// the day the wall clock caught up to it — a date-bomb, first detonated
// 2026-08-19 ~14:00 UTC. Pinning "now" to early that morning makes the
// fixture eternal.
vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-08-19T08:00:00Z') })

beforeEach(() => {
  // The slot cache is module state keyed by org — a fresh org per test is
  // the isolation (and mirrors production: one cache, many clinics).
  ORG = `org_${++orgSeq}`
  state.connection = { ...BINDING }
  state.providerMaps = [{ externalId: '42' }]
  state.appointments = []
  state.nexSlots = [
    { time: '2026-08-19T10:30:00.000-04:00', operatory_id: 2 },
    { time: '2026-08-19T10:00:00.000-04:00', operatory_id: 1 },
    { time: '2026-08-19T10:00:00.000-04:00', operatory_id: 2 }, // dupe instant
    { time: '2026-08-20T10:00:00.000-04:00', operatory_id: 1 }, // wrong day
  ]
  state.nexCalls = 0
  state.budgetThrows = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('getBookableSlotsForDay — the PMS branch', () => {
  it('offers THEIR open times: deduped, sorted, day-filtered, labeled in the clinic tz', async () => {
    const r = await getBookableSlotsForDay(ORG, DAY, undefined, 30)
    expect(r.source).toBe('pms')
    expect(r.slots.map((s) => s.startIso)).toEqual(['2026-08-19T14:00:00.000Z', '2026-08-19T14:30:00.000Z'])
    // 10:00 ET renders as the CLINIC's 9:00 AM (America/Chicago).
    expect(r.slots[0].label).toBe('9:00 AM')
    expect(r.slots.every((s) => s.available)).toBe(true)
    expect(r.closedReason).toBeNull()
  })

  it('an empty practice day reads day_closed; all-too-soon reads past_closing', async () => {
    state.nexSlots = []
    expect((await getBookableSlotsForDay(ORG, DAY)).closedReason).toBe('day_closed')
    // Slots exist but the notice window floors them out (10000h ≈ 416 days).
    // Fresh org so the just-cached empty day doesn't answer this half.
    ORG = `org_${++orgSeq}`
    state.nexSlots = [{ time: '2026-08-19T10:00:00.000-04:00' }]
    const r = await getBookableSlotsForDay(ORG, DAY, undefined, 30, 10000)
    expect(r.slots).toHaveLength(0)
    expect(r.closedReason).toBe('past_closing')
  })

  it('caches for 2 minutes — browsing patients spend ONE metered call per day+duration', async () => {
    await getBookableSlotsForDay(ORG, DAY, undefined, 30)
    await getBookableSlotsForDay(ORG, DAY, undefined, 30)
    expect(state.nexCalls).toBe(1)
    // A different duration is a different question — one more call.
    await getBookableSlotsForDay(ORG, DAY, undefined, 60)
    expect(state.nexCalls).toBe(2)
  })

  it('falls back to the LOCAL engine: no binding / no synced providers / budget reached', async () => {
    state.connection = null
    expect((await getBookableSlotsForDay(ORG, DAY)).source).toBe('local')

    state.connection = { ...BINDING }
    state.providerMaps = []
    expect((await getBookableSlotsForDay(ORG, DAY)).source).toBe('local')

    state.providerMaps = [{ externalId: '42' }]
    state.connection = { ...BINDING, meta: { ...BINDING.meta, env: 'production' } }
    state.budgetThrows = true
    expect((await getBookableSlotsForDay(ORG, DAY)).source).toBe('local')
  })

  it('sandbox bindings never consult the budget (free calls, the test bed)', async () => {
    state.budgetThrows = true // would throw IF consulted
    const r = await getBookableSlotsForDay(ORG, DAY, undefined, 30)
    expect(r.source).toBe('pms')
  })
})

describe('isBookableSlot — the submit guard, branch-consistent', () => {
  const TARGET = new Date('2026-08-19T14:00:00.000Z')

  it('accepts a slot their engine lists (fresh read — cache bypassed)', async () => {
    await getBookableSlotsForDay(ORG, DAY, undefined, 30) // warm the cache
    const before = state.nexCalls
    expect(await isBookableSlot(ORG, TARGET, 30)).toBe(true)
    expect(state.nexCalls).toBe(before + 1) // a write decision never trusts the cache
  })

  it('refuses a time their engine does not list', async () => {
    expect(await isBookableSlot(ORG, new Date('2026-08-19T23:00:00.000Z'), 30)).toBe(false)
  })

  it('counts local not-yet-pushed bookings against capacity', async () => {
    // Two chairs; two live local bookings overlap the target instant.
    state.appointments = [
      { startTime: TARGET, endTime: new Date('2026-08-19T14:30:00.000Z'), status: 'scheduled' },
      { startTime: TARGET, endTime: new Date('2026-08-19T14:30:00.000Z'), status: 'confirmed' },
    ]
    expect(await isBookableSlot(ORG, TARGET, 30)).toBe(false)
    // Cancelled rows don't consume a chair.
    state.appointments = [
      { startTime: TARGET, endTime: new Date('2026-08-19T14:30:00.000Z'), status: 'cancelled' },
    ]
    expect(await isBookableSlot(ORG, TARGET, 30)).toBe(true)
  })
})
