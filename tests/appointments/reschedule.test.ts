import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the calls reschedule makes so we can assert the insert +
// cancel pattern + that the new row points back at the original.
// rescheduleAppointment no longer uses db.transaction() — the Neon HTTP
// driver doesn't support transactions. Writes run directly off the
// top-level `db`. The mock intentionally has NO `transaction` method, so
// a regression that reintroduces one fails loudly.
const txState = {
  selects: [] as unknown[],
  updates: [] as Array<{ set: Record<string, unknown> }>,
  inserts: [] as Array<{ values: Record<string, unknown> }>,
  selectResult: null as unknown,
}

function dbMethods() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => txState.selectResult,
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          txState.updates.push({ set: patch })
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        txState.inserts.push({ values })
      },
    }),
  }
}

vi.mock('@/lib/db', () => ({
  db: dbMethods(),
  schema: {
    appointment: {
      id: 'id',
      organizationId: 'organizationId',
      patientId: 'patientId',
    },
    appointmentReminderLog: {},
    clinicProvider: {},
    clinicLocation: {},
    patient: {},
    user: {},
    customers: {},
    invoices: {},
    formSubmission: {},
    formTemplate: {},
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _kind: 'and' })),
  eq: vi.fn(() => ({ _kind: 'eq' })),
  inArray: vi.fn(() => ({ _kind: 'inArray' })),
  isNull: vi.fn(() => ({ _kind: 'isNull' })),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _kind: 'gte' })),
  lte: vi.fn(() => ({ _kind: 'lte' })),
  ne: vi.fn(() => ({ _kind: 'ne' })),
  or: vi.fn(() => ({ _kind: 'or' })),
  sql: Object.assign(vi.fn(() => ({ _kind: 'sql' })), { raw: vi.fn() }),
}))

import { rescheduleAppointment } from '@/lib/services/appointments'

beforeEach(() => {
  txState.selects = []
  txState.updates = []
  txState.inserts = []
})

describe('rescheduleAppointment — atomic cancel + insert', () => {
  it('cancels the original and inserts a new row with a backref', async () => {
    txState.selectResult = [
      {
        id: 'appt_old',
        organizationId: 'org_1',
        patientId: 'pat_1',
        locationId: 'loc_1',
        providerId: 'prov_1',
        title: 'cleaning — Mia Hayes',
        type: 'cleaning',
        notes: null,
      },
    ]
    const newStart = new Date('2026-06-01T15:00:00Z')

    const newId = await rescheduleAppointment({
      organizationId: 'org_1',
      appointmentId: 'appt_old',
      newStartTime: newStart,
      newEndTime: new Date('2026-06-01T15:30:00Z'),
    })

    expect(newId).toMatch(/^appt_/)
    expect(newId).not.toBe('appt_old')

    // Cancel patch
    expect(txState.updates).toHaveLength(1)
    expect(txState.updates[0].set.status).toBe('cancelled')
    expect(txState.updates[0].set.cancelledAt).toBeInstanceOf(Date)

    // Insert of the new row
    expect(txState.inserts).toHaveLength(1)
    const insertedRow = txState.inserts[0].values
    expect(insertedRow.id).toBe(newId)
    expect(insertedRow.rescheduledFromAppointmentId).toBe('appt_old')
    expect(insertedRow.status).toBe('scheduled')
    expect(insertedRow.source).toBe('manual')
    expect(insertedRow.patientId).toBe('pat_1')
    expect(insertedRow.providerId).toBe('prov_1')
    expect(insertedRow.locationId).toBe('loc_1')
    expect(insertedRow.type).toBe('cleaning')
    expect(insertedRow.startTime).toEqual(newStart)
  })

  it('throws if the original appointment is not found', async () => {
    txState.selectResult = []
    await expect(
      rescheduleAppointment({
        organizationId: 'org_1',
        appointmentId: 'appt_missing',
        newStartTime: new Date('2026-06-01T15:00:00Z'),
        newEndTime: null,
      }),
    ).rejects.toThrow(/not found/i)
    // No mutations should have happened.
    expect(txState.updates).toHaveLength(0)
    expect(txState.inserts).toHaveLength(0)
  })

  it('preserves the original provider + location + type on the new row', async () => {
    txState.selectResult = [
      {
        id: 'appt_old',
        organizationId: 'org_1',
        patientId: 'pat_2',
        locationId: null,
        providerId: 'prov_dentist',
        title: 'consultation — Aiden Kim',
        type: 'consultation',
        notes: 'Bring last X-rays',
      },
    ]
    await rescheduleAppointment({
      organizationId: 'org_1',
      appointmentId: 'appt_old',
      newStartTime: new Date('2026-06-15T09:00:00Z'),
      newEndTime: null,
    })
    const inserted = txState.inserts[0].values
    expect(inserted.providerId).toBe('prov_dentist')
    expect(inserted.locationId).toBeNull()
    expect(inserted.type).toBe('consultation')
    expect(inserted.notes).toBe('Bring last X-rays')
  })
})
