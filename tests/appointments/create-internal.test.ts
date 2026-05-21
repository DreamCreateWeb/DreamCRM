import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  patientSelect: null as null | Array<{ id: string; firstName: string; lastName: string }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => (t === 'patient' ? state.patientSelect ?? [] : []),
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: String(t), values })
      },
    }),
    update: (t: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table: String(t), set: s })
        },
      }),
    }),
  },
  schema: {
    patient: 'patient',
    appointment: 'appointment',
    clinicProvider: 'clinic_provider',
    clinicLocation: 'clinic_location',
    appointmentReminderLog: 'appointment_reminder_log',
    formSubmission: 'form_submission',
    formTemplate: 'form_template',
    user: 'user',
    customers: 'customers',
    invoices: 'invoices',
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

import { createInternalAppointment } from '@/lib/services/appointments'

beforeEach(() => {
  state.patientSelect = null
  state.inserts = []
  state.updates = []
})

describe('createInternalAppointment — security boundary + defaults', () => {
  it('throws when the patient is not in the supplied organization', async () => {
    state.patientSelect = []
    await expect(
      createInternalAppointment({
        organizationId: 'org_a',
        patientId: 'pat_b_belongs_to_other_org',
        startTime: new Date('2026-06-01T10:00:00Z'),
      }),
    ).rejects.toThrow(/not found in this clinic/i)
    // No mutations on the security failure.
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('defaults endTime to start + 30 min and type to cleaning', async () => {
    state.patientSelect = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes' }]
    const start = new Date('2026-06-01T10:00:00Z')
    await createInternalAppointment({
      organizationId: 'org_1',
      patientId: 'pat_1',
      startTime: start,
    })
    const inserted = state.inserts.find((i) => i.table === 'appointment')
    expect(inserted).toBeDefined()
    const v = inserted!.values
    expect(v.type).toBe('cleaning')
    expect(v.status).toBe('scheduled')
    expect((v.endTime as Date).getTime() - (v.startTime as Date).getTime()).toBe(30 * 60 * 1000)
    expect(v.source).toBe('manual')
  })

  it('bumps patient.lastActivityAt to keep the agenda + needs-attention fresh', async () => {
    state.patientSelect = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes' }]
    await createInternalAppointment({
      organizationId: 'org_1',
      patientId: 'pat_1',
      startTime: new Date('2026-06-01T10:00:00Z'),
    })
    const patientBump = state.updates.find((u) => u.table === 'patient')
    expect(patientBump).toBeDefined()
    expect(patientBump!.set.lastActivityAt).toBeInstanceOf(Date)
  })

  it('respects an explicit endTime + type + providerId + source', async () => {
    state.patientSelect = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes' }]
    const start = new Date('2026-06-01T10:00:00Z')
    const end = new Date('2026-06-01T11:30:00Z')
    await createInternalAppointment({
      organizationId: 'org_1',
      patientId: 'pat_1',
      startTime: start,
      endTime: end,
      type: 'root_canal',
      providerId: 'prov_x',
      source: 'recall_campaign',
      notes: 'Pre-op consent on file',
    })
    const v = state.inserts.find((i) => i.table === 'appointment')!.values
    expect(v.type).toBe('root_canal')
    expect(v.endTime).toEqual(end)
    expect(v.providerId).toBe('prov_x')
    expect(v.source).toBe('recall_campaign')
    expect(v.notes).toBe('Pre-op consent on file')
  })
})
