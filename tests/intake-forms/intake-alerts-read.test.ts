import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getIntakeAlertsForAppointments (ML-27) — the batched chair read of the
 * cached pre-visit alerts: ONE query, keyed by appointment; per visit the
 * patient's newest submission that carries a non-empty alert list; junk and
 * alert-less summaries skipped; no ids → no query at all.
 */

const state = { rows: [] as unknown[], queries: 0 }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => {
      state.queries++
      return Promise.resolve(state.rows)
    }
    return obj
  }
  return {
    db: { select: () => chain() },
    schema: {
      formSubmission: { id: 'fs.id', organizationId: 'fs.org', patientId: 'fs.patient', aiSummary: 'fs.sum', submittedAt: 'fs.at' },
      appointment: { id: 'a.id', organizationId: 'a.org', patientId: 'a.patient' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
}))

import { getIntakeAlertsForAppointments } from '@/lib/services/intake-summary'

beforeEach(() => {
  state.rows = []
  state.queries = 0
})

describe('getIntakeAlertsForAppointments', () => {
  it('no appointment ids → an empty map and NO query', async () => {
    const out = await getIntakeAlertsForAppointments('org_1', [])
    expect(out.size).toBe(0)
    expect(state.queries).toBe(0)
  })

  it('one query for the batch; the newest submission WITH alerts wins per visit, alert-less and junk rows are skipped', async () => {
    // Rows arrive newest-first (the query orders by submitted_at desc).
    state.rows = [
      { appointmentId: 'a1', submissionId: 'sub_consent', aiSummary: { summary: 'Signed the consent.', alerts: [] } },
      { appointmentId: 'a1', submissionId: 'sub_intake', aiSummary: { summary: 'On a blood thinner.', alerts: ['Takes warfarin (blood thinner)', 'Allergic to penicillin'] } },
      { appointmentId: 'a1', submissionId: 'sub_older', aiSummary: { summary: 'old', alerts: ['Stale alert'] } },
      { appointmentId: 'a2', submissionId: 'sub_junk', aiSummary: 'not a summary' },
      { appointmentId: 'a3', submissionId: 'sub_clean', aiSummary: { summary: 'Healthy adult.', alerts: [] } },
    ]
    const out = await getIntakeAlertsForAppointments('org_1', ['a1', 'a2', 'a3', 'a1'])
    expect(state.queries).toBe(1)
    expect(out.get('a1')).toEqual({ submissionId: 'sub_intake', alerts: ['Takes warfarin (blood thinner)', 'Allergic to penicillin'] })
    expect(out.has('a2')).toBe(false)
    expect(out.has('a3')).toBe(false)
  })
})
