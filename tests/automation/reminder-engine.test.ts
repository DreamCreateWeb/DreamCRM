import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * runDueReminders — windowing + idempotency + skip rules.
 *
 * The db is mocked to a query-builder that resolves per `from(table)`:
 *   - clinic_profile      -> the clinic rows (org + reminderSettings)
 *   - appointment         -> candidate appointments in the window (the engine's
 *                            own .where() already encodes status/window/email;
 *                            we hand back exactly the rows that survive it)
 *   - appointment_reminder_log -> the idempotency check (a recent reminder row)
 *
 * getAppointmentDetail / getClinicSenderIdentity and the send internals are
 * stubbed so we assert orchestration, not the email body.
 */

interface ApptDetail {
  id: string
  patientEmail: string | null
}

const state = {
  profiles: [] as Array<{ organizationId: string; reminderSettings: unknown }>,
  candidates: [] as Array<{ appointmentId: string; patientId: string }>,
  // appointmentIds that already have a reminder logged within the window.
  alreadyLogged: new Set<string>(),
  details: new Map<string, ApptDetail>(),
  sent: [] as string[],
}

function makeThenable(resolve: () => Promise<unknown> | unknown) {
  const chain: Record<string, unknown> = {
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onF, onR),
  }
  return chain
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        if (table === 'clinic_profile') return makeThenable(() => state.profiles)
        if (table === 'appointment') return makeThenable(() => state.candidates)
        if (table === 'appointment_reminder_log') {
          // The engine asks "is there a recent reminder for THIS appointment".
          // We can't see the id from here, so the per-call result is driven by a
          // queue the test seeds in candidate order.
          return makeThenable(() => {
            const id = idemQueue.shift()
            return id && state.alreadyLogged.has(id) ? [{ id: 'log_x' }] : []
          })
        }
        return makeThenable(() => [])
      },
    }),
  },
  schema: {
    clinicProfile: 'clinic_profile',
    appointment: 'appointment',
    patient: 'patient',
    appointmentReminderLog: 'appointment_reminder_log',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (...a: unknown[]) => ({ _eq: a }),
  ne: (...a: unknown[]) => ({ _ne: a }),
  gte: (...a: unknown[]) => ({ _gte: a }),
  lte: (...a: unknown[]) => ({ _lte: a }),
  inArray: (...a: unknown[]) => ({ _inArray: a }),
  isNotNull: (...a: unknown[]) => ({ _isNotNull: a }),
}))

vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    name: 'Acme Dental',
    from: 'Acme <acme@x.com>',
    replyTo: null,
    timeZone: 'America/New_York',
  })),
}))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/appointments', () => ({
  logReminderSent: vi.fn(async () => 'rem_1'),
  getAppointmentDetail: vi.fn(async (_org: string, id: string) => {
    const d = state.details.get(id)
    if (!d) return null
    return {
      id: d.id,
      type: 'cleaning',
      startTime: new Date('2026-06-12T15:00:00Z'),
      patient: { id: `pat_${id}`, fullName: 'Sam Jones', email: d.patientEmail },
    }
  }),
}))

// Order the idempotency checks fire in (mirrors candidate iteration order).
let idemQueue: string[] = []

import { runDueReminders } from '@/lib/services/reminder-automation'

beforeEach(() => {
  state.profiles = []
  state.candidates = []
  state.alreadyLogged = new Set()
  state.details = new Map()
  state.sent = []
  idemQueue = []
  vi.clearAllMocks()
})

describe('runDueReminders', () => {
  it('skips an org whose reminders are disabled (orgsScanned excludes it)', async () => {
    state.profiles = [{ organizationId: 'org_off', reminderSettings: { enabled: false } }]
    const r = await runDueReminders()
    expect(r.orgsScanned).toBe(0)
    expect(r.candidates).toBe(0)
    expect(r.sent).toBe(0)
  })

  it('sends a reminder for an eligible candidate (defaults: enabled, 24h)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    state.details.set('a1', { id: 'a1', patientEmail: 'sam@example.com' })
    idemQueue = ['a1']

    const r = await runDueReminders()
    expect(r.orgsScanned).toBe(1)
    expect(r.candidates).toBe(1)
    expect(r.sent).toBe(1)
    expect(r.alreadyReminded).toBe(0)
  })

  it('idempotency: skips a candidate that already has a reminder within the window', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    state.details.set('a1', { id: 'a1', patientEmail: 'sam@example.com' })
    state.alreadyLogged.add('a1')
    idemQueue = ['a1']

    const r = await runDueReminders()
    expect(r.candidates).toBe(1)
    expect(r.alreadyReminded).toBe(1)
    expect(r.sent).toBe(0)
  })

  it('skips a candidate whose detail has no email (defensive)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    state.candidates = [{ appointmentId: 'a2', patientId: 'p2' }]
    state.details.set('a2', { id: 'a2', patientEmail: null })
    idemQueue = ['a2']

    const r = await runDueReminders()
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
  })

  it('processes multiple candidates: one sent, one already-reminded', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: { enabled: true, offsetHours: 48 } }]
    state.candidates = [
      { appointmentId: 'a1', patientId: 'p1' },
      { appointmentId: 'a2', patientId: 'p2' },
    ]
    state.details.set('a1', { id: 'a1', patientEmail: 'one@example.com' })
    state.details.set('a2', { id: 'a2', patientEmail: 'two@example.com' })
    state.alreadyLogged.add('a2')
    idemQueue = ['a1', 'a2']

    const r = await runDueReminders()
    expect(r.candidates).toBe(2)
    expect(r.sent).toBe(1)
    expect(r.alreadyReminded).toBe(1)
  })

  it('handles a clinic with no candidates cleanly', async () => {
    state.profiles = [{ organizationId: 'org_empty', reminderSettings: null }]
    const r = await runDueReminders()
    expect(r.orgsScanned).toBe(1)
    expect(r.candidates).toBe(0)
    expect(r.sent).toBe(0)
  })
})
