/**
 * EXECUTED coverage for the reminder-log ledger writer (logReminderSent in
 * lib/services/appointments.ts) — the round-1 audit's two findings on it:
 *
 *  - the forms-completion engine logs through here with template
 *    'forms_intake', and the ledger must narrate a FORMS nudge, never a
 *    visit-time reminder that was never sent;
 *  - the patient-name read must be org-scoped (a cross-org appointment id
 *    must never leak another clinic's patient into a summary);
 *  - staff-clicked sends never enter the machine's ledger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { state, recordActionMock, eqMock } = vi.hoisted(() => ({
  state: {
    selectQueue: [] as unknown[][],
    inserted: [] as Array<Record<string, unknown>>,
  },
  recordActionMock: vi.fn(async (..._a: unknown[]) => true),
  eqMock: vi.fn((col: unknown, val: unknown) => ({ _kind: 'eq', col, val })),
}))

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'innerJoin', 'where']) obj[m] = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          state.inserted.push(v)
        },
      }),
    },
    schema: {
      appointment: {
        organizationId: 'appointment.organizationId',
        id: 'appointment.id',
        patientId: 'appointment.patientId',
        startTime: 'appointment.startTime',
      },
      patient: { id: 'patient.id', firstName: 'patient.firstName' },
      appointmentReminderLog: {},
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...a: unknown[]) => ({ _kind: 'and', a })),
  eq: eqMock,
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _kind: 'gte' })),
  lte: vi.fn(() => ({ _kind: 'lte' })),
  ne: vi.fn(() => ({ _kind: 'ne' })),
  or: vi.fn(() => ({ _kind: 'or' })),
  inArray: vi.fn(() => ({ _kind: 'inArray' })),
  isNull: vi.fn(() => ({ _kind: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _kind: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/action-ledger', () => ({ recordAction: recordActionMock }))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { logReminderSent } from '@/lib/services/appointments'

const APPT_ROW = {
  patientId: 'pat_1',
  startTime: new Date('2026-07-28T19:00:00Z'), // 2 PM Central
  firstName: 'Mia',
}

beforeEach(() => {
  state.selectQueue = []
  state.inserted = []
  recordActionMock.mockClear()
  eqMock.mockClear()
})

describe('logReminderSent → the Action Ledger', () => {
  it('a machine visit reminder narrates the visit time in the clinic tz', async () => {
    state.selectQueue = [[APPT_ROW]]
    await logReminderSent({
      organizationId: 'org_1',
      appointmentId: 'a1',
      channel: 'email',
      template: 'reminder',
      sentByUserId: null,
    })
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('appointment_reminder')
    expect(entry.patientId).toBe('pat_1')
    expect(String(entry.summary)).toMatch(/^Reminded Mia about .*2:00 PM/)
  })

  it("the forms engine's nudge (template 'forms_intake') narrates FORMS, not a reminder", async () => {
    state.selectQueue = [[APPT_ROW]]
    await logReminderSent({
      organizationId: 'org_1',
      appointmentId: 'a1',
      channel: 'email',
      template: 'forms_intake',
      sentByUserId: null,
    })
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('forms_reminder')
    expect(String(entry.summary)).toMatch(/^Nudged Mia to finish their forms before /)
    expect(String(entry.summary)).not.toMatch(/Reminded/)
  })

  it('a staff-clicked send is THEIR work — log row yes, ledger entry no', async () => {
    const id = await logReminderSent({
      organizationId: 'org_1',
      appointmentId: 'a1',
      channel: 'email',
      sentByUserId: 'user_1',
    })
    expect(id).toBeTruthy()
    expect(state.inserted).toHaveLength(1)
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('the patient-name read is org-scoped (no cross-org leak into a summary)', async () => {
    state.selectQueue = [[APPT_ROW]]
    await logReminderSent({
      organizationId: 'org_1',
      appointmentId: 'a1',
      channel: 'email',
      sentByUserId: null,
    })
    const pairs = eqMock.mock.calls.map((c) => [c[0], c[1]])
    expect(pairs).toContainEqual(['appointment.organizationId', 'org_1'])
  })

  it('a vanished appointment row skips the ledger without breaking the log write', async () => {
    state.selectQueue = [[]]
    const id = await logReminderSent({
      organizationId: 'org_1',
      appointmentId: 'a_gone',
      channel: 'email',
      sentByUserId: null,
    })
    expect(id).toBeTruthy()
    expect(recordActionMock).not.toHaveBeenCalled()
  })
})
