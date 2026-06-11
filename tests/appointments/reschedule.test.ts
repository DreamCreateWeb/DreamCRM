import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the calls reschedule makes so we can assert the insert +
// cancel pattern + that the new row points back at the original.
// rescheduleAppointment runs its two writes inside db.transaction() (restored
// now the DB is node-postgres). The mock's `transaction(cb)` invokes the
// callback with the SAME methods object (the `tx`), so writes routed through
// `tx` land in the same capture arrays — proving the writes actually run inside
// the transaction. `txRollbacks` counts callback throws (the tx aborting).
const txState = {
  selects: [] as unknown[],
  updates: [] as Array<{ set: Record<string, unknown> }>,
  inserts: [] as Array<{ values: Record<string, unknown> }>,
  selectResult: null as unknown,
  txCalls: 0,
  txRollbacks: 0,
  // When set, the next insert inside the tx throws — to assert rollback.
  failNextInsert: false,
}

function dbMethods(): any {
  const methods = {
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
        if (txState.failNextInsert) {
          txState.failNextInsert = false
          throw new Error('insert blew up')
        }
        txState.inserts.push({ values })
      },
    }),
    // transaction(cb) → run cb with the same mock as `tx`. Real drizzle/pg
    // rolls back when the callback throws; we model that by counting the throw
    // and re-throwing so the caller sees the failure.
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      txState.txCalls += 1
      try {
        return await cb(methods)
      } catch (err) {
        txState.txRollbacks += 1
        throw err
      }
    },
  }
  return methods
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
  txState.txCalls = 0
  txState.txRollbacks = 0
  txState.failNextInsert = false
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

    // Both writes ran inside a single transaction (atomic cancel + insert).
    expect(txState.txCalls).toBe(1)
    expect(txState.txRollbacks).toBe(0)
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

  it('preserves the original visit duration when no new end time is supplied', async () => {
    // Original is a 60-minute visit; the reschedule drawer only sends a new
    // start. The new row must keep the 60-minute length, not collapse to null.
    txState.selectResult = [
      {
        id: 'appt_old',
        organizationId: 'org_1',
        patientId: 'pat_4',
        locationId: 'loc_1',
        providerId: 'prov_1',
        title: 'crown — Noah Park',
        type: 'crown',
        notes: null,
        status: 'scheduled',
        startTime: new Date('2026-06-01T14:00:00Z'),
        endTime: new Date('2026-06-01T15:00:00Z'),
      },
    ]
    const newStart = new Date('2026-06-10T18:00:00Z')
    await rescheduleAppointment({
      organizationId: 'org_1',
      appointmentId: 'appt_old',
      newStartTime: newStart,
      newEndTime: null,
    })
    const inserted = txState.inserts[0].values
    expect(inserted.endTime).toEqual(new Date('2026-06-10T19:00:00Z')) // +60 min
  })

  it('defaults to a 30-minute block when the original had no end time', async () => {
    txState.selectResult = [
      {
        id: 'appt_old',
        organizationId: 'org_1',
        patientId: 'pat_5',
        locationId: null,
        providerId: null,
        title: 'consult',
        type: 'consultation',
        notes: null,
        status: 'scheduled',
        startTime: new Date('2026-06-01T14:00:00Z'),
        endTime: null,
      },
    ]
    const newStart = new Date('2026-06-10T18:00:00Z')
    await rescheduleAppointment({
      organizationId: 'org_1',
      appointmentId: 'appt_old',
      newStartTime: newStart,
      newEndTime: null,
    })
    expect(txState.inserts[0].values.endTime).toEqual(new Date('2026-06-10T18:30:00Z')) // +30 min
  })

  it('refuses to reschedule a cancelled (terminal) appointment', async () => {
    txState.selectResult = [
      {
        id: 'appt_old',
        organizationId: 'org_1',
        patientId: 'pat_6',
        status: 'cancelled',
        startTime: new Date('2026-06-01T14:00:00Z'),
        endTime: null,
      },
    ]
    await expect(
      rescheduleAppointment({
        organizationId: 'org_1',
        appointmentId: 'appt_old',
        newStartTime: new Date('2026-06-10T18:00:00Z'),
        newEndTime: null,
      }),
    ).rejects.toThrow(/already cancelled/i)
    expect(txState.inserts).toHaveLength(0)
    expect(txState.updates).toHaveLength(0)
  })

  it('carries the original booking source forward instead of resetting to manual', async () => {
    txState.selectResult = [
      {
        id: 'appt_old',
        organizationId: 'org_1',
        patientId: 'pat_3',
        locationId: 'loc_1',
        providerId: 'prov_1',
        title: 'cleaning — Emma Lopez',
        type: 'cleaning',
        notes: null,
        source: 'booking_widget',
      },
    ]
    await rescheduleAppointment({
      organizationId: 'org_1',
      appointmentId: 'appt_old',
      newStartTime: new Date('2026-07-01T16:00:00Z'),
      newEndTime: null,
    })
    // A widget/portal appointment keeps its attribution through a reschedule.
    expect(txState.inserts[0].values.source).toBe('booking_widget')
  })

  it('runs both writes inside db.transaction() and rolls back when the insert fails', async () => {
    txState.selectResult = [
      {
        id: 'appt_old',
        organizationId: 'org_1',
        patientId: 'pat_7',
        locationId: 'loc_1',
        providerId: 'prov_1',
        title: 'cleaning — Liam Reed',
        type: 'cleaning',
        notes: null,
        status: 'scheduled',
        startTime: new Date('2026-06-01T14:00:00Z'),
        endTime: new Date('2026-06-01T14:30:00Z'),
      },
    ]
    txState.failNextInsert = true
    await expect(
      rescheduleAppointment({
        organizationId: 'org_1',
        appointmentId: 'appt_old',
        newStartTime: new Date('2026-06-10T18:00:00Z'),
        newEndTime: null,
      }),
    ).rejects.toThrow(/insert blew up/)
    // The transaction was entered and rolled back; the cancel UPDATE never
    // committed (it would have left the original cancelled with no replacement).
    expect(txState.txCalls).toBe(1)
    expect(txState.txRollbacks).toBe(1)
    expect(txState.inserts).toHaveLength(0)
    expect(txState.updates).toHaveLength(0)
  })
})
