import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getInboxPatientContext — the Inbox patient strip. "Last visit" must be the
 * most recent ATTENDED visit (past, not cancelled/no-show), matching
 * getPatientHeader, not whatever row sorts last; the three appointment reads
 * run as one parallel batch.
 */

let patientRow: Record<string, unknown> | null = null
// Results for the appointment reads, in construction order: [upcoming, recent, count].
let apptResults: unknown[][] = []
let apptCall = 0

function thenable(resolve: () => unknown) {
  const chain: Record<string, unknown> = {
    from: (t: unknown) => {
      // The patient read resolves immediately; appointment reads pull from the queue.
      if (t === 'patient') return chainFor(() => (patientRow ? [patientRow] : []))
      return chainFor(() => apptResults[apptCall++] ?? [])
    },
  }
  return chain
  function chainFor(r: () => unknown) {
    const c: Record<string, unknown> = {
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (onF: (v: unknown) => unknown) => Promise.resolve(r()).then(onF),
    }
    return c
  }
}

vi.mock('@/lib/db', () => ({
  db: { select: () => thenable(() => []) },
  schema: { patient: 'patient', appointment: 'appointment' },
}))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }), asc: (x: unknown) => x, desc: (x: unknown) => x,
  eq: (...a: unknown[]) => ({ a }), gte: (...a: unknown[]) => ({ a }),
  lte: (...a: unknown[]) => ({ a }), ne: (...a: unknown[]) => ({ a }),
  sql: () => ({}),
}))

import { getInboxPatientContext } from '@/lib/services/patient-context'

beforeEach(() => {
  patientRow = { id: 'p1', firstName: 'Mia', lastName: 'Hayes' }
  apptResults = []
  apptCall = 0
})

describe('getInboxPatientContext', () => {
  it('returns null when the patient is not found', async () => {
    patientRow = null
    expect(await getInboxPatientContext('p1', 'org_1')).toBeNull()
  })

  it('maps next visit, last visit, and count from the parallel reads', async () => {
    const next = { id: 'a_next', startTime: new Date(), type: 'cleaning', status: 'scheduled' }
    const last = { id: 'a_last', startTime: new Date(), type: 'exam', status: 'completed' }
    apptResults = [[next], [last], [{ count: 5 }]]
    const ctx = await getInboxPatientContext('p1', 'org_1')
    expect(ctx?.patient.id).toBe('p1')
    expect(ctx?.nextAppointment).toEqual(next)
    expect(ctx?.lastAppointment).toEqual(last)
    expect(ctx?.appointmentCount).toBe(5)
  })

  it('nulls next/last when there are no qualifying visits', async () => {
    apptResults = [[], [], [{ count: 0 }]]
    const ctx = await getInboxPatientContext('p1', 'org_1')
    expect(ctx?.nextAppointment).toBeNull()
    expect(ctx?.lastAppointment).toBeNull()
    expect(ctx?.appointmentCount).toBe(0)
  })
})
