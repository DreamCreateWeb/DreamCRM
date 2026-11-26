import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE HUDDLE's day in the demo clinic (lib/services/demo-clinic/seed-huddle.ts).
 *
 * The demo-org data rule is the thing under test: REAL patients exist in
 * the demo org, so a seeded visit may land only on a persona, matched by
 * identity — and a missing persona is skipped, never substituted.
 */

const state = {
  rows: [] as Array<Record<string, unknown>>,
  sets: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    schema,
    db: {
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          expect(table).toBe(schema.appointment)
          state.rows.push(v)
          return {
            onConflictDoUpdate: async (cfg: { target: unknown; set: Record<string, unknown> }) => {
              // The row's identity is its id — the upsert must key on it.
              expect(cfg.target).toBe(schema.appointment.id)
              state.sets.push(cfg.set)
            },
          }
        },
      }),
    },
  }
})

import {
  DEMO_HUDDLE_APPT_PREFIX,
  DEMO_HUDDLE_SLOTS,
  demoHuddleAppointmentId,
  demoHuddleSlotStart,
  seedDemoHuddleDay,
} from '@/lib/services/demo-clinic/seed-huddle'
import { clinicDayKey } from '@/lib/format-datetime'
import { clinicDayStart } from '@/lib/clinic-timezone'

const TZ = 'America/Chicago'
// 11:30 PM Tuesday in Chicago — already Wednesday in UTC. The day the rows
// land on must be the CLINIC's, whatever hour a deploy happens to resync at.
const LATE = new Date('2026-11-25T05:30:00Z')

const personaIds = Array.from({ length: 15 }, (_, i) => `pat_${i}`)
const names = Array.from({ length: 15 }, (_, i) => ({ firstName: `First${i}`, lastName: `Last${i}` }))

const seed = (over: Partial<Parameters<typeof seedDemoHuddleDay>[0]> = {}) =>
  seedDemoHuddleDay({
    orgId: 'org_demo',
    personaPatientIds: personaIds,
    personaNames: names,
    locationId: 'loc_1',
    dentistId: 'prov_d',
    hygienistId: 'prov_h',
    now: LATE,
    timeZone: TZ,
    ...over,
  })

beforeEach(() => {
  state.rows.length = 0
  state.sets.length = 0
})

describe('the demo’s Huddle day', () => {
  it('lays a yesterday and a today on the clinic’s calendar — at 11:30 PM local, “today” is still today', async () => {
    expect(await seed()).toBe(7)
    const todayKey = clinicDayKey(LATE, TZ)
    const yesterdayKey = clinicDayKey(clinicDayStart(LATE, TZ, -1), TZ)
    expect(todayKey).toBe('2026-11-24')
    const on = (key: string) => state.rows.filter((r) => clinicDayKey(r.startTime as Date, TZ) === key)
    expect(on(yesterdayKey).map((r) => r.status).sort()).toEqual(['completed', 'completed', 'no_show'])
    expect(on(todayKey).map((r) => r.status).sort()).toEqual(['confirmed', 'confirmed', 'scheduled'])
    // Wall-clock hours a practice keeps: the first visit of each day is 9:00 AM local.
    const local = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
    expect(on(todayKey).map((r) => local(r.startTime as Date)).sort()).toEqual(['11:00 AM', '2:00 PM', '9:00 AM'])
    for (const r of state.rows) {
      const start = (r.startTime as Date).getTime()
      expect((r.endTime as Date).getTime() - start).toBe(45 * 60 * 1000)
    }
  })

  it('every row carries the marker, the org and a deterministic id — and is UPSERTED, so a resync moves seven rows and never adds an eighth', async () => {
    await seed()
    await seed({ now: new Date(LATE.getTime() + 24 * 60 * 60 * 1000) })
    const ids = state.rows.map((r) => r.id as string)
    expect(new Set(ids).size).toBe(7)
    for (const r of state.rows) {
      expect(r.organizationId).toBe('org_demo')
      expect(r.id as string).toMatch(new RegExp(`^${DEMO_HUDDLE_APPT_PREFIX}org_demo_`))
    }
    expect(demoHuddleAppointmentId('org_demo', 't1')).toBe('appt_demohud_org_demo_t1')
    // The update half resets where the visit stands and never re-keys the row.
    expect(state.sets).toHaveLength(14)
    for (const set of state.sets) {
      expect(set).not.toHaveProperty('id')
      expect(set).not.toHaveProperty('organizationId')
      expect(set).toHaveProperty('status')
      expect(set).toHaveProperty('startTime')
      expect(set.cancelledAt).toBeNull()
    }
  })

  it('anchors each row to its persona BY IDENTITY, and skips a persona that is not on file — never a stand-in', async () => {
    const withGaps = personaIds.map((id, i) => (i === 9 || i === 12 ? null : id))
    expect(await seed({ personaPatientIds: withGaps })).toBe(5)
    const used = new Set(state.rows.map((r) => r.patientId))
    expect(used.has(null as unknown as string)).toBe(false)
    for (const s of DEMO_HUDDLE_SLOTS) {
      const row = state.rows.find((r) => r.id === demoHuddleAppointmentId('org_demo', s.slot))
      if (s.persona === 9 || s.persona === 12) expect(row, s.slot).toBeUndefined()
      else expect(row?.patientId, s.slot).toBe(`pat_${s.persona}`)
    }
    // Nobody at all on file → nothing written.
    state.rows.length = 0
    expect(await seed({ personaPatientIds: [] })).toBe(0)
    expect(state.rows).toEqual([])
  })

  it('leaves Mason alone (a lead who has never booked) and gives the returning patient an older visit', () => {
    expect(DEMO_HUDDLE_SLOTS.some((s) => s.persona === 11)).toBe(false)
    const prior = DEMO_HUDDLE_SLOTS.find((s) => s.slot === 'prior')!
    const y2 = DEMO_HUDDLE_SLOTS.find((s) => s.slot === 'y2')!
    expect(prior.persona).toBe(y2.persona)
    expect(prior.status).toBe('completed')
    expect(demoHuddleSlotStart(prior, LATE, TZ).getTime()).toBeLessThan(demoHuddleSlotStart(y2, LATE, TZ).getTime())
    // The first-visit story holds only while that persona has ONE visit.
    const y1 = DEMO_HUDDLE_SLOTS.find((s) => s.slot === 'y1')!
    expect(DEMO_HUDDLE_SLOTS.filter((s) => s.persona === y1.persona)).toHaveLength(1)
  })

  it('stamps what the status implies, so the row reads as a real visit', async () => {
    await seed()
    const by = (slot: string) => state.rows.find((r) => r.id === demoHuddleAppointmentId('org_demo', slot))!
    expect(by('y1').completedAt).toBeInstanceOf(Date)
    expect(by('y3').noShowedAt).toBeInstanceOf(Date)
    expect(by('y3').completedAt).toBeNull()
    expect(by('t1')).toMatchObject({ confirmedVia: 'email', providerId: 'prov_d', locationId: 'loc_1' })
    expect(by('t2')).toMatchObject({ confirmedAt: null, providerId: 'prov_h' })
    expect(by('t1').title).toBe('checkup — First12 Last12')
  })
})
