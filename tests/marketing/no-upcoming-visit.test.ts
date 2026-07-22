import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Resolver-level test for the phase-4 `noUpcomingVisit` suppression: a patient
 * with a future (non-cancelled) appointment is DROPPED from an audience whose
 * filter sets `noUpcomingVisit: true`. This is the branch that makes the
 * reactivation/lapsed "come back" campaigns skip people who already booked —
 * if it regressed to a no-op, the automation would nag patients with a visit
 * on the books. (Filter parsing is covered in patient-audience.test.ts.)
 */

// resolvePatientAudience issues its selects in a fixed order: (1) the patient
// base query, then (2) the upcoming-appointments query (the last-visit query is
// skipped — this filter doesn't need it). A simple FIFO queue mocks both.
const queue: unknown[][] = []

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            const rows = queue.shift() ?? []
            const p = Promise.resolve(rows) as Promise<unknown[]> & { orderBy: () => Promise<unknown[]> }
            p.orderBy = () => Promise.resolve(rows)
            return p
          },
        }),
      }),
    },
    schema,
  }
})

import { resolvePatientAudience, PatientAudienceFilter } from '@/lib/services/marketing'

function patientRow(id: string) {
  return {
    id,
    firstName: 'Pat',
    lastName: id.toUpperCase(),
    email: `${id}@example.com`,
    phone: null,
    dateOfBirth: null,
    lifecycle: 'active',
    marketingEmailOptIn: 1,
    marketingSmsOptIn: 0,
    pmsRecallDueAt: null,
    pmsBalanceCents: 0,
    insuranceProvider: null,
  }
}

beforeEach(() => {
  queue.length = 0
})

describe('resolvePatientAudience — noUpcomingVisit', () => {
  it('drops patients with a future appointment and keeps those without', async () => {
    const future = new Date(Date.now() + 3 * 86_400_000)
    queue.push([patientRow('p_booked'), patientRow('p_free')]) // base patient query
    queue.push([{ patientId: 'p_booked', startTime: future, status: 'scheduled' }]) // upcoming query

    const rows = await resolvePatientAudience('org_1', PatientAudienceFilter.parse({ noUpcomingVisit: true }))
    expect(rows.map((r) => r.patientId)).toEqual(['p_free'])
  })

  it('without the flag, booked patients stay in the audience', async () => {
    queue.push([patientRow('p_booked'), patientRow('p_free')])
    // No upcoming query runs (needUpcoming=false) — the queue's second entry
    // would go unread, so don't push one.

    const rows = await resolvePatientAudience('org_1', PatientAudienceFilter.parse({}))
    expect(rows.map((r) => r.patientId).sort()).toEqual(['p_booked', 'p_free'])
  })
})
