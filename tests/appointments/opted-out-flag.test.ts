import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The agenda's 🔕 flag is DERIVED, not a literal `false`. `listAppointments`
 * used to hardcode `optedOut: false` while the legend on /appointments
 * explained a glyph that could therefore never render — and the Patients
 * list computed the same flag honestly from marketingEmailOptIn. Both pages
 * now read the same column with the same rule (0 = unsubscribed).
 */

const state = {
  queue: [] as unknown[][],
}

// A thenable chain: every stage returns the chain, and awaiting it yields the
// next queued result (the main select first, then each fan-out in order).
vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) obj[m] = () => obj
    obj.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(state.queue.shift() ?? []).then(resolve, reject)
    return obj
  }
  const col = (name: string) => ({ name })
  return {
    db: { select: () => chain() },
    schema: {
      appointment: {
        id: col('id'), organizationId: col('org'), patientId: col('patientId'), startTime: col('startTime'),
        endTime: col('endTime'), type: col('type'), status: col('status'), source: col('source'), notes: col('notes'),
        providerId: col('providerId'), locationId: col('locationId'), confirmedAt: col('confirmedAt'),
        cancelledAt: col('cancelledAt'), arrivedAt: col('arrivedAt'), seatedAt: col('seatedAt'),
        rescheduledFromAppointmentId: col('resched'), createdAt: col('createdAt'),
      },
      patient: {
        id: col('p.id'), firstName: col('p.first'), lastName: col('p.last'), dateOfBirth: col('p.dob'),
        email: col('p.email'), phone: col('p.phone'), lifecycle: col('p.lifecycle'), userId: col('p.user'),
        marketingEmailOptIn: col('p.optin'), pmsBalanceCents: col('p.balance'),
      },
      clinicProvider: { id: col('prov.id'), displayName: col('prov.name') },
      clinicLocation: { id: col('loc.id'), name: col('loc.name') },
      formSubmission: { appointmentId: col('fs.appt'), patientId: col('fs.patient'), organizationId: col('fs.org') },
      appointmentReminderLog: { appointmentId: col('rl.appt'), sentAt: col('rl.sent'), organizationId: col('rl.org') },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  or: vi.fn(() => ({ _: 'or' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/Chicago') }))
vi.mock('@/lib/services/feature-switches', () => ({ getFeatureSwitchState: vi.fn(async () => ({ intake_forms: true })) }))
vi.mock('@/lib/services/clinic-cadence', () => ({ getClinicCadence: vi.fn(async () => ({ lapsedMonths: 9 })) }))
vi.mock('@/lib/services/patient-tags', () => ({
  getTagsForPatients: vi.fn(async () => new Map()),
  getTagsForPatient: vi.fn(async () => []),
}))
vi.mock('@/lib/services/pms', () => ({ queueAppointmentWriteBack: vi.fn(), queueAppointmentStatusWriteBack: vi.fn() }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn(async () => true) }))
vi.mock('@/lib/services/email-automations', () => ({ getEmailAutomations: vi.fn() }))

import { listAppointments, isMarketingEmailOptedOut } from '@/lib/services/appointments'

function apptRow(id: string, marketingEmailOptIn: number) {
  const start = new Date(Date.now() + 3 * 3600_000)
  return {
    id, patientId: `pat_${id}`, firstName: 'Mia', lastName: 'Hayes', dateOfBirth: null,
    patientEmail: 'mia@example.com', patientLifecycle: 'active', marketingEmailOptIn,
    startTime: start, endTime: new Date(start.getTime() + 30 * 60_000), type: 'cleaning', status: 'scheduled',
    source: 'manual', notes: null, providerId: null, providerName: null, locationName: null,
    confirmedAt: null, cancelledAt: null, arrivedAt: null, seatedAt: null,
    rescheduledFromAppointmentId: null, createdAt: new Date(Date.now() - 7 * 24 * 3600_000), pmsBalanceCents: 0,
  }
}

beforeEach(() => {
  state.queue = []
})

describe('isMarketingEmailOptedOut', () => {
  it('is the Patients-list rule: 0 = unsubscribed, anything else is not', () => {
    expect(isMarketingEmailOptedOut(0)).toBe(true)
    expect(isMarketingEmailOptedOut(1)).toBe(false)
    expect(isMarketingEmailOptedOut(null)).toBe(false)
    expect(isMarketingEmailOptedOut(undefined)).toBe(false)
  })
})

describe('listAppointments — the 🔕 flag is derived from the patient row', () => {
  it('flips optedOut on a patient who unsubscribed, and only them', async () => {
    state.queue = [[apptRow('a1', 0), apptRow('a2', 1)]] // main select; fan-outs yield []
    const rows = await listAppointments('org_1', { window: 'today' })
    expect(rows.map((r) => [r.id, r.flags.optedOut])).toEqual([
      ['a1', true],
      ['a2', false],
    ])
  })
})
