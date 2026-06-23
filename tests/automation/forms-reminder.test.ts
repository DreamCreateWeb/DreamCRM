import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * runDueFormReminders — nudge patients with an upcoming LIVE visit who haven't
 * finished their intake. The submission + dedup checks are now BATCHED (one
 * query per org each, not per candidate), so the mock returns whole sets keyed
 * by `from(table)`:
 *   clinic_profile -> orgs, appointment -> candidates,
 *   form_submission -> patients who already submitted (submittedPatientIds),
 *   appointment_reminder_log -> appts already reminded (remindedAppointmentIds).
 */

const state = {
  profiles: [] as Array<{ organizationId: string; reminderSettings: unknown }>,
  candidates: [] as Array<{ appointmentId: string; patientId: string }>,
  submittedPatientIds: [] as string[],
  remindedAppointmentIds: [] as string[],
}

function makeThenable(resolve: () => unknown) {
  const chain: Record<string, unknown> = {
    innerJoin: () => chain,
    where: () => chain,
    limit: () => chain,
    then: (onF: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onF),
  }
  return chain
}

const from = (table: unknown) => {
  if (table === 'clinic_profile') return makeThenable(() => state.profiles)
  if (table === 'appointment') return makeThenable(() => state.candidates)
  if (table === 'form_submission')
    return makeThenable(() => state.submittedPatientIds.map((patientId) => ({ patientId })))
  if (table === 'appointment_reminder_log')
    return makeThenable(() => state.remindedAppointmentIds.map((appointmentId) => ({ appointmentId })))
  return makeThenable(() => [])
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from }),
    selectDistinct: () => ({ from }),
  },
  schema: {
    clinicProfile: 'clinic_profile',
    appointment: 'appointment',
    patient: 'patient',
    formSubmission: 'form_submission',
    appointmentReminderLog: 'appointment_reminder_log',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  ne: (...a: unknown[]) => ({ a }),
  gte: (...a: unknown[]) => ({ a }),
  lte: (...a: unknown[]) => ({ a }),
  inArray: (...a: unknown[]) => ({ a }),
  isNotNull: (...a: unknown[]) => ({ a }),
}))

const sendIntakeRequestToPatient = vi.fn(async () => ({ sentTo: 'x@y.com', formTitle: 'Intake' }))
vi.mock('@/lib/services/patient-intake-send', () => ({
  sendIntakeRequestToPatient: (...a: unknown[]) => sendIntakeRequestToPatient(...(a as [])),
}))
const logReminderSent = vi.fn(async () => 'rem_1')
vi.mock('@/lib/services/appointments', () => ({ logReminderSent: (...a: unknown[]) => logReminderSent(...(a as [])) }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))

import { runDueFormReminders } from '@/lib/services/reminder-automation'

beforeEach(() => {
  state.profiles = [{ organizationId: 'org_1', reminderSettings: { formsReminder: true } }]
  state.candidates = []
  state.submittedPatientIds = []
  state.remindedAppointmentIds = []
  vi.clearAllMocks()
})

describe('runDueFormReminders', () => {
  it('skips an org with formsReminder off', async () => {
    state.profiles = [{ organizationId: 'org_off', reminderSettings: { formsReminder: false } }]
    const r = await runDueFormReminders()
    expect(r.orgsScanned).toBe(0)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
  })

  it('sends to a patient with no submission + logs a forms_intake row', async () => {
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    const r = await runDueFormReminders()
    expect(r.sent).toBe(1)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledWith('org_1', 'p1')
    expect(logReminderSent).toHaveBeenCalledWith(expect.objectContaining({ template: 'forms_intake', appointmentId: 'a1' }))
  })

  it('skips a patient who already submitted a form', async () => {
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    state.submittedPatientIds = ['p1'] // already submitted
    const r = await runDueFormReminders()
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
  })

  it('dedups via a recent forms_intake log', async () => {
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    state.remindedAppointmentIds = ['a1'] // already reminded within the window
    const r = await runDueFormReminders()
    expect(r.sent).toBe(0)
    expect(r.alreadyReminded).toBe(1)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
  })

  it('reminds a patient once even with two upcoming visits', async () => {
    state.candidates = [
      { appointmentId: 'a1', patientId: 'p1' },
      { appointmentId: 'a2', patientId: 'p1' },
    ]
    const r = await runDueFormReminders()
    expect(r.sent).toBe(1)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledTimes(1)
  })
})
