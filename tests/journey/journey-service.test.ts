/**
 * EXECUTED coverage for the journey service (lib/services/patient-journey.ts).
 * The round-1 audit found its laws were pinned only by source-grep — these
 * run the mapping code against canned aggregate rows:
 *
 *  - stage facts use ALL appointment history (an imported completed visit
 *    still makes someone a patient) while transition TIMESTAMPS exclude
 *    PMS-imported rows (connecting a PMS must never read as a growth spike);
 *  - cancelled-everything people land back at inquiry;
 *  - the funnel skips bulk-backfilled records and windows each transition.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const state = { queue: [] as unknown[][] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'leftJoin', 'groupBy']) obj[m] = () => obj
    obj.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(state.queue.shift() ?? []).then(res, rej)
    return obj
  }
  return { db: { select: () => chain() } }
})

import {
  getJourneyForPatients,
  getJourneyFunnel,
  getJourneyStageCounts,
} from '@/lib/services/patient-journey'

beforeEach(() => {
  state.queue = []
})

describe('getJourneyForPatients — stages from facts, timestamps import-honest', () => {
  it('maps the four stages and keeps import-excluded timestamps null', async () => {
    state.queue = [
      // patients
      [
        { id: 'p_inq', firstSeenAt: new Date('2026-07-01'), lifecycle: 'active' },
        { id: 'p_book', firstSeenAt: new Date('2026-07-02'), lifecycle: 'active' },
        { id: 'p_pat', firstSeenAt: new Date('2026-07-03'), lifecycle: 'active' },
        { id: 'p_arch', firstSeenAt: new Date('2026-07-04'), lifecycle: 'archived' },
        { id: 'p_pms', firstSeenAt: new Date('2026-07-05'), lifecycle: 'active' },
      ],
      // appointment aggregates (p_inq has none)
      [
        {
          patientId: 'p_book',
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: true,
          hasCompletedEver: false,
          firstSeatedAt: null,
        },
        {
          patientId: 'p_pat',
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: new Date('2026-07-12'),
        },
        {
          patientId: 'p_arch',
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: new Date('2026-07-12'),
        },
        // The PMS-import shape: every appointment is imported, so BOTH
        // timestamps come back null from the SQL — but the completed visit
        // still makes them a patient. WHO they are vs WHEN they transitioned.
        {
          patientId: 'p_pms',
          firstBookedAt: null,
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: null,
        },
      ],
    ]
    const map = await getJourneyForPatients('org_1', ['p_inq', 'p_book', 'p_pat', 'p_arch', 'p_pms'])
    expect(map.get('p_inq')?.stage).toBe('inquiry')
    expect(map.get('p_book')?.stage).toBe('booked')
    expect(map.get('p_pat')?.stage).toBe('patient')
    expect(map.get('p_arch')?.stage).toBe('archived')
    expect(map.get('p_pms')?.stage).toBe('patient')
    expect(map.get('p_pms')?.firstBookedAt).toBeNull()
    expect(map.get('p_pms')?.firstSeatedAt).toBeNull()
    expect(map.get('p_pat')?.firstSeatedAt).toEqual(new Date('2026-07-12'))
  })

  it('cancelled-everything people are inquiries again (a booked timestamp alone is not a live booking)', async () => {
    state.queue = [
      [{ id: 'p_cx', firstSeenAt: new Date('2026-07-01'), lifecycle: 'active' }],
      [
        {
          patientId: 'p_cx',
          // They DID book once (the timestamp exists) — then cancelled it all.
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: false,
          hasCompletedEver: false,
          firstSeatedAt: null,
        },
      ],
    ]
    const map = await getJourneyForPatients('org_1', ['p_cx'])
    expect(map.get('p_cx')?.stage).toBe('inquiry')
    expect(map.get('p_cx')?.firstBookedAt).toEqual(new Date('2026-07-10'))
  })

  it('returns an empty map without querying when no ids are asked for', async () => {
    const map = await getJourneyForPatients('org_1', [])
    expect(map.size).toBe(0)
    expect(state.queue).toHaveLength(0)
  })
})

describe('getJourneyFunnel — transitions inside the window, backfill excluded', () => {
  const NOW = new Date('2026-07-27T12:00:00Z') // since = 2026-06-27

  it('counts each transition in-window and skips bulk-backfilled records entirely', async () => {
    state.queue = [
      [
        // Fresh inquiry this month — counts once, as an inquiry.
        { patientId: 'a', source: 'website', firstSeenAt: new Date('2026-07-10'), firstBookedAt: null, firstSeatedAt: null },
        // Long-known person who finally booked this month.
        { patientId: 'b', source: 'website', firstSeenAt: new Date('2026-03-01'), firstBookedAt: new Date('2026-07-05'), firstSeatedAt: null },
        // Seated this month (booked earlier).
        { patientId: 'c', source: 'booking_widget', firstSeenAt: new Date('2026-04-01'), firstBookedAt: new Date('2026-05-01'), firstSeatedAt: new Date('2026-07-20') },
        // PMS backfill with every timestamp "in window" — never counted.
        { patientId: 'd', source: 'pms_import', firstSeenAt: new Date('2026-07-15'), firstBookedAt: new Date('2026-07-15'), firstSeatedAt: new Date('2026-07-15') },
        // CSV backfill — never counted.
        { patientId: 'e', source: 'import', firstSeenAt: new Date('2026-07-15'), firstBookedAt: null, firstSeatedAt: null },
        // Everything before the window — nothing counted.
        { patientId: 'f', source: 'website', firstSeenAt: new Date('2026-01-01'), firstBookedAt: new Date('2026-01-05'), firstSeatedAt: new Date('2026-01-20') },
      ],
    ]
    const funnel = await getJourneyFunnel('org_1', 30, NOW)
    expect(funnel).toEqual({ inquiries: 1, booked: 1, seated: 1 })
  })
})

describe('getJourneyStageCounts — the standing population', () => {
  it('buckets by live-booking + seated facts', async () => {
    state.queue = [
      [
        { patientId: 'a', hasBooked: false, hasSeated: false },
        { patientId: 'b', hasBooked: true, hasSeated: false },
        { patientId: 'c', hasBooked: true, hasSeated: true },
        { patientId: 'd', hasBooked: null, hasSeated: null }, // no appointments at all
      ],
    ]
    expect(await getJourneyStageCounts('org_1')).toEqual({ inquiry: 2, booked: 1, patient: 1 })
  })
})

describe('the PMS-import exclusion lives in the SQL, not in hope', () => {
  it('both timestamp aggregates in both queries ride NOT_IMPORTED', () => {
    const src = readFileSync(resolve(__dirname, '../../lib/services/patient-journey.ts'), 'utf8')
    expect(src).toContain("is distinct from 'pms_import'")
    // 1 definition + 4 uses (booked + seated, in getJourneyForPatients AND
    // getJourneyFunnel). If a fifth aggregate appears without it, look hard.
    expect((src.match(/\$\{NOT_IMPORTED\}/g) ?? []).length).toBe(4)
  })
})
