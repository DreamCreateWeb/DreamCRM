import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * runDueFormReminders — nudge patients with an upcoming LIVE visit who haven't
 * finished their intake. The submission + dedup checks are BATCHED (one query
 * per org each, not per candidate), so the mock returns whole sets keyed by
 * `from(table)`:
 *   clinic_profile -> orgs, appointment -> candidates,
 *   form_submission -> the newest submission per (patient, form) (state.submissions),
 *   appointment_reminder_log -> appts already reminded (remindedAppointmentIds).
 * The org's forms are the RULES (ML-27): `listFormTemplates` → state.forms.
 */

// 11:00 AM Eastern — inside the send window for the default timezone, so the
// quiet-hours gate (lib/reminder-hours.ts) stands aside for every test that
// is not about it. The engine used to be called on the real clock here,
// which would have made the suite fail between 8 PM and 8 AM Eastern.
const NOW = new Date('2026-06-10T15:00:00Z')

const DEFAULT_FORM = {
  id: 'form_default',
  isDefault: 1,
  autoSendAudience: 'all',
  appointmentTypeIds: null as string[] | null,
  refreshMonths: null as number | null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const state = {
  profiles: [] as Array<{ organizationId: string; reminderSettings: unknown; timezone?: string }>,
  candidates: [] as Array<{ appointmentId: string; patientId: string; type?: string }>,
  submissions: [] as Array<{ patientId: string; formTemplateId?: string; last?: Date }>,
  remindedAppointmentIds: [] as string[],
  forms: [] as Array<typeof DEFAULT_FORM>,
}

/** Shorthand for the old harness's "these patients submitted something". */
function submitted(...patientIds: string[]) {
  state.submissions = patientIds.map((patientId) => ({ patientId, formTemplateId: 'form_default', last: new Date('2026-06-01T12:00:00Z') }))
}

function makeThenable(resolve: () => unknown) {
  const chain: Record<string, unknown> = {
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    limit: () => chain,
    then: (onF: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onF),
  }
  return chain
}

const from = (table: unknown) => {
  if (table === 'clinic_profile') return makeThenable(() => state.profiles)
  if (table === 'appointment') return makeThenable(() => state.candidates.map((c) => ({ type: 'cleaning', ...c })))
  if (table === 'form_submission')
    return makeThenable(() =>
      state.submissions.map((s) => ({ patientId: s.patientId, formTemplateId: s.formTemplateId ?? 'form_default', last: s.last ?? new Date('2026-06-01T12:00:00Z') })),
    )
  if (table === 'appointment_reminder_log')
    return makeThenable(() => state.remindedAppointmentIds.map((appointmentId) => ({ appointmentId })))
  return makeThenable(() => [])
}

// The Guardian's failure door (Phase 4 open item #1) — a collaborator here,
// with its own tests in tests/journey/engine-failures.ts. Mocked so these
// harnesses' slim db stubs don't have to model the ledger write.
vi.mock('@/lib/services/engine-failures', () => ({
  reportAutomationFailure: vi.fn(async () => true),
}))

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
  max: (...a: unknown[]) => ({ a }),
}))

const sendIntakeRequestToPatient = vi.fn(async () => ({ sentTo: 'x@y.com', formTitle: 'Intake' }))
// OFF UNTIL CHOSEN (audit round 3): the cron asks the ONE intake gate per clinic.
const intakeOpen = { value: true }
vi.mock('@/lib/services/forms', () => ({
  patientFacingIntakeOpen: async () => intakeOpen.value,
  listFormTemplates: async () => state.forms,
}))
vi.mock('@/lib/services/patient-intake-send', () => ({
  sendIntakeRequestToPatient: (...a: unknown[]) => sendIntakeRequestToPatient(...(a as [])),
}))
const logReminderSent = vi.fn(async () => 'rem_1')
vi.mock('@/lib/services/appointments', () => ({ logReminderSent: (...a: unknown[]) => logReminderSent(...(a as [])) }))
vi.mock('@/lib/email', () => ({ patientEmailShell: vi.fn((o: { title?: string; body?: string; cta?: { url: string; label: string }; footnoteHtml?: string }) => `<html>${o?.title ?? ''}${o?.body ?? ''}${o?.cta ? `<a href="${o.cta.url}">${o.cta.label}</a>` : ''}${o?.footnoteHtml ?? ''}</html>`), sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))

import { runDueFormReminders } from '@/lib/services/reminder-automation'

beforeEach(() => {
  state.profiles = [{ organizationId: 'org_1', reminderSettings: { formsReminder: true } }]
  state.candidates = []
  state.submissions = []
  state.remindedAppointmentIds = []
  state.forms = [{ ...DEFAULT_FORM }]
  vi.clearAllMocks()
})

describe('runDueFormReminders', () => {
  it('skips a clinic whose Intake Forms door is closed — the seeded form is not theirs to send (audit round 3)', async () => {
    intakeOpen.value = false
    state.profiles = [{ organizationId: 'org_closed', reminderSettings: { formsReminder: true } }]
    try {
      const r = await runDueFormReminders({ now: NOW })
      expect(r.orgsScanned).toBe(0)
      expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
    } finally {
      intakeOpen.value = true
    }
  })

  it('skips an org with formsReminder off', async () => {
    state.profiles = [{ organizationId: 'org_off', reminderSettings: { formsReminder: false } }]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.orgsScanned).toBe(0)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
  })

  it('sends to a patient with no submission + logs a forms_intake row — the picked rule rides along', async () => {
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledWith('org_1', 'p1', 'form_default')
    expect(logReminderSent).toHaveBeenCalledWith(expect.objectContaining({ template: 'forms_intake', appointmentId: 'a1' }))
  })

  it('skips a patient who already submitted a form', async () => {
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    submitted('p1') // already submitted
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
  })

  it('dedups via a recent forms_intake log', async () => {
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    state.remindedAppointmentIds = ['a1'] // already reminded within the window
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.alreadyReminded).toBe(1)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
  })

  it('reminds a patient once even with two upcoming visits', async () => {
    state.candidates = [
      { appointmentId: 'a1', patientId: 'p1' },
      { appointmentId: 'a2', patientId: 'p1' },
    ]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledTimes(1)
  })

  it('a practice with no live form has nothing to chase', async () => {
    state.forms = []
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
  })
})

describe('runDueFormReminders — the refresh window (ML-27, G3-7)', () => {
  it('a returning patient whose form is older than the rule’s window is asked again; a newer one is on file', async () => {
    state.forms = [{ ...DEFAULT_FORM, refreshMonths: 12 }]
    state.candidates = [
      { appointmentId: 'a1', patientId: 'p_old' },
      { appointmentId: 'a2', patientId: 'p_fresh' },
    ]
    // NOW is June 2026; the cutoff is the clinic-local 1 June 2025 (12 whole
    // months back, month boundary — never "365 days ago").
    state.submissions = [
      { patientId: 'p_old', formTemplateId: 'form_default', last: new Date('2025-05-20T12:00:00Z') },
      { patientId: 'p_fresh', formTemplateId: 'form_default', last: new Date('2025-06-02T12:00:00Z') },
    ]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(r.skipped).toBe(1)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledTimes(1)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledWith('org_1', 'p_old', 'form_default')
  })

  it('with no window (the default) a years-old submission is still on file — nothing changes until a clinic sets a rule', async () => {
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]
    state.submissions = [{ patientId: 'p1', formTemplateId: 'form_default', last: new Date('2022-01-10T12:00:00Z') }]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
  })
})

describe('runDueFormReminders — visit-type targeting (ML-27, G3-20)', () => {
  const CONSENT = {
    id: 'form_sedation_consent',
    isDefault: 0,
    autoSendAudience: 'all',
    appointmentTypeIds: ['sedation'],
    refreshMonths: null,
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  }

  it('a sedation visit gets the sedation consent only; a cleaning gets the general intake', async () => {
    state.forms = [{ ...DEFAULT_FORM }, CONSENT]
    state.candidates = [
      { appointmentId: 'a1', patientId: 'p_sed', type: 'sedation' },
      { appointmentId: 'a2', patientId: 'p_clean', type: 'cleaning' },
    ]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(2)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledWith('org_1', 'p_sed', 'form_sedation_consent')
    expect(sendIntakeRequestToPatient).toHaveBeenCalledWith('org_1', 'p_clean', 'form_default')
  })

  it('a visit-specific form is on file only when THAT form was filled — last year’s general intake does not cover the consent', async () => {
    state.forms = [{ ...DEFAULT_FORM }, CONSENT]
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1', type: 'sedation' }]
    state.submissions = [{ patientId: 'p1', formTemplateId: 'form_default', last: new Date('2026-06-01T12:00:00Z') }]
    const first = await runDueFormReminders({ now: NOW })
    expect(first.sent).toBe(1)
    expect(sendIntakeRequestToPatient).toHaveBeenCalledWith('org_1', 'p1', 'form_sedation_consent')

    vi.clearAllMocks()
    state.submissions.push({ patientId: 'p1', formTemplateId: 'form_sedation_consent', last: new Date('2026-06-03T12:00:00Z') })
    const second = await runDueFormReminders({ now: NOW })
    expect(second.sent).toBe(0)
    expect(second.skipped).toBe(1)
  })

  it('no rule covers the visit → nothing is sent, nothing is logged', async () => {
    state.forms = [CONSENT]
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1', type: 'cleaning' }]
    const r = await runDueFormReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
    expect(logReminderSent).not.toHaveBeenCalled()
  })
})

describe('runDueFormReminders — quiet hours (lib/reminder-hours.ts, rule 1)', () => {
  it('a clinic outside its own 8 AM–8 PM is held whole — nothing sent, nothing logged — and nudged at 8', async () => {
    state.profiles = [
      { organizationId: 'org_la', reminderSettings: { formsReminder: true }, timezone: 'America/Los_Angeles' },
    ]
    state.candidates = [{ appointmentId: 'a1', patientId: 'p1' }]

    // 12:00Z is 5:00 AM in Los Angeles.
    const held = await runDueFormReminders({ now: new Date('2026-06-10T12:00:00Z') })
    expect(held.outsideWindow).toBe(1)
    expect(held.orgsScanned).toBe(0)
    expect(held.sent).toBe(0)
    expect(sendIntakeRequestToPatient).not.toHaveBeenCalled()
    expect(logReminderSent).not.toHaveBeenCalled()

    // 15:00Z is 8:00 AM in Los Angeles — the nudge goes, nothing held it back.
    const r = await runDueFormReminders({ now: new Date('2026-06-10T15:00:00Z') })
    expect(r.outsideWindow).toBe(0)
    expect(r.sent).toBe(1)
    expect(logReminderSent).toHaveBeenCalledTimes(1)
  })
})
