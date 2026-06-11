import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * listReviewsReceived ↔ appointment linkage.
 *
 * A received review should remember which visit triggered it, so the
 * /reviews/received card can say "After their {date} visit" and link back to
 * the schedule. The service left-joins the appointment (FK is ON DELETE SET
 * NULL, and ad-hoc requests have no appointment), surfacing appointmentId +
 * appointmentDate — null when unlinked, never dropping the row.
 */

const state = {
  rows: [] as Record<string, unknown>[],
  joins: [] as string[],
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.innerJoin = () => {
        state.joins.push('inner')
        return chain
      }
      chain.leftJoin = () => {
        state.joins.push('left')
        return chain
      }
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.limit = async () => state.rows
      return chain
    },
  },
  schema: {
    reviewRequest: 'reviewRequest',
    patient: 'patient',
    appointment: 'appointment',
    clinicProfile: 'clinicProfile',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  desc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  count: vi.fn(() => ({ _: 'count' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ id: 'mock' }) } } }))

import { listReviewsReceived } from '@/lib/services/reviews'

beforeEach(() => {
  state.rows = []
  state.joins = []
})

describe('listReviewsReceived — appointment linkage', () => {
  it('left-joins the appointment (so unlinked requests still return)', async () => {
    state.rows = []
    await listReviewsReceived('org_1')
    expect(state.joins).toContain('left')
  })

  it('surfaces the triggering visit date + appointmentId when linked', async () => {
    const visit = new Date('2026-06-03T15:00:00Z')
    state.rows = [
      {
        id: 'rev_1',
        patientId: 'pat_1',
        patientFirstName: 'Mia',
        patientLastName: 'Hayes',
        patientCity: 'Austin',
        patientState: 'TX',
        completedAt: new Date('2026-06-05T12:00:00Z'),
        selectedSite: 'google',
        reviewText: 'Great visit.',
        rating: 5,
        appointmentId: 'appt_1',
        appointmentDate: visit,
      },
    ]
    const out = await listReviewsReceived('org_1')
    expect(out).toHaveLength(1)
    expect(out[0].appointmentId).toBe('appt_1')
    expect(out[0].appointmentDate).toEqual(visit)
  })

  it('leaves appointmentId/date null when the request has no linked visit', async () => {
    state.rows = [
      {
        id: 'rev_2',
        patientId: 'pat_2',
        patientFirstName: 'Noah',
        patientLastName: 'Kim',
        patientCity: null,
        patientState: null,
        completedAt: new Date('2026-06-05T12:00:00Z'),
        selectedSite: null,
        reviewText: 'Thanks!',
        rating: null,
        appointmentId: null,
        appointmentDate: null,
      },
    ]
    const out = await listReviewsReceived('org_1')
    expect(out[0].appointmentId).toBeNull()
    expect(out[0].appointmentDate).toBeNull()
    // Row is still returned (left join, not inner) — the review isn't hidden
    // just because no appointment is attached.
    expect(out[0].reviewText).toBe('Thanks!')
  })
})
