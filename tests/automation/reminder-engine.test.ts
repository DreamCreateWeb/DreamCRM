import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * runDueReminders — journey touch selection + per-touch idempotency + the
 * min-gap suppression + confirmed-vs-unconfirmed variants.
 *
 * The db is mocked to a query-builder that resolves per `from(table)`:
 *   - clinic_profile           -> the clinic rows (org + reminderSettings)
 *   - appointment              -> candidate appointments in the window
 *   - appointment_reminder_log -> prior log rows (per-candidate queue)
 *
 * getAppointmentDetail / getClinicSenderIdentity and the send internals are
 * stubbed so we assert orchestration, not the email body.
 */

interface ApptDetail {
  id: string
  patientEmail: string | null
  startTime: Date
  status?: string
}

const NOW = new Date('2026-06-10T12:00:00Z')
const HOUR = 60 * 60 * 1000
const inHours = (h: number) => new Date(NOW.getTime() + h * HOUR)
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR)

const state = {
  profiles: [] as Array<{ organizationId: string; reminderSettings: unknown }>,
  candidates: [] as Array<{
    appointmentId: string
    patientId: string
    startTime: Date
    guardianPatientId?: string | null
  }>,
  details: new Map<string, ApptDetail>(),
  // Guardian-email lookups (from(patient)), shifted per email-less candidate.
  guardianQueue: [] as Array<Array<{ email: string | null }>>,
}

// Per-candidate prior-log rows, shifted in candidate order.
let logQueue: Array<Array<{ template: string | null; sentAt: Date }>> = []

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
        if (table === 'appointment_reminder_log') return makeThenable(() => logQueue.shift() ?? [])
        if (table === 'patient') return makeThenable(() => state.guardianQueue.shift() ?? [])
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
  or: (...a: unknown[]) => ({ _or: a }),
  eq: (...a: unknown[]) => ({ _eq: a }),
  ne: (...a: unknown[]) => ({ _ne: a }),
  gte: (...a: unknown[]) => ({ _gte: a }),
  lte: (...a: unknown[]) => ({ _lte: a }),
  inArray: (...a: unknown[]) => ({ _inArray: a }),
  isNotNull: (...a: unknown[]) => ({ _isNotNull: a }),
}))

const { deliverMock, sendNotificationEmailMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(async () => {}),
  sendNotificationEmailMock: vi.fn(async () => {}),
}))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  sendNotificationEmail: sendNotificationEmailMock,
  authEmailShell: vi.fn(() => '<html>reminder</html>'),
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    name: 'Acme Dental',
    from: 'Acme <acme@x.com>',
    replyTo: null,
    gmail: null,
    timeZone: 'America/New_York',
  })),
}))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/appointment-confirm', () => ({
  getOrCreateConfirmToken: vi.fn(async () => 'ct_test_token'),
}))

const { logReminderSentMock } = vi.hoisted(() => ({
  logReminderSentMock: vi.fn(async () => 'rem_1'),
}))
vi.mock('@/lib/services/appointments', () => ({
  logReminderSent: logReminderSentMock,
  getAppointmentDetail: vi.fn(async (_org: string, id: string) => {
    const d = state.details.get(id)
    if (!d) return null
    return {
      id: d.id,
      type: 'cleaning',
      status: d.status ?? 'scheduled',
      startTime: d.startTime,
      patient: { id: `pat_${id}`, fullName: 'Sam Jones', email: d.patientEmail },
    }
  }),
}))

import { runDueReminders } from '@/lib/services/reminder-automation'

function seedCandidate(
  id: string,
  startInHours: number,
  opts: { email?: string | null; status?: string; guardianPatientId?: string } = {},
) {
  const startTime = inHours(startInHours)
  state.candidates.push({
    appointmentId: id,
    patientId: `p_${id}`,
    startTime,
    guardianPatientId: opts.guardianPatientId ?? null,
  })
  state.details.set(id, {
    id,
    patientEmail: opts.email === undefined ? 'sam@example.com' : opts.email,
    startTime,
    status: opts.status,
  })
}

beforeEach(() => {
  state.profiles = []
  state.candidates = []
  state.details = new Map()
  state.guardianQueue = []
  logQueue = []
  vi.clearAllMocks()
})

describe('runDueReminders — journeys', () => {
  it('skips an org whose reminders are disabled (orgsScanned excludes it)', async () => {
    state.profiles = [{ organizationId: 'org_off', reminderSettings: { enabled: false } }]
    const r = await runDueReminders({ now: NOW })
    expect(r.orgsScanned).toBe(0)
    expect(r.sent).toBe(0)
  })

  it('sends the most-imminent due touch (20h out on the default [72,24] journey → the 24h touch)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(logReminderSentMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'auto_reminder_24h', sentByUserId: null }),
    )
    // Unconfirmed → the email ships through the confirm-button shell.
    expect(deliverMock).toHaveBeenCalledTimes(1)
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()
  })

  it('a visit 60h out gets the 72h touch (its window is open; 24h is not yet)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 60)
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(logReminderSentMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'auto_reminder_72h' }),
    )
  })

  it('per-touch idempotency: the same touch never fires twice', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    logQueue = [[{ template: 'auto_reminder_24h', sentAt: hoursAgo(30) }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.alreadyReminded).toBe(1)
    expect(r.sent).toBe(0)
  })

  it('min-gap suppression: a touch (or manual send) within 20h suppresses the next touch', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    // The 72h touch fired an hour ago (late booking) — don't stack the 24h one.
    logQueue = [[{ template: 'auto_reminder_72h', sentAt: hoursAgo(1) }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.alreadyReminded).toBe(1)
    expect(r.sent).toBe(0)
  })

  it('the second touch fires once the gap has passed', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    logQueue = [[{ template: 'auto_reminder_72h', sentAt: hoursAgo(49) }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(logReminderSentMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'auto_reminder_24h' }),
    )
  })

  it('a recent FORMS nudge does not suppress the visit reminder', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    logQueue = [[{ template: 'forms_intake', sentAt: hoursAgo(1) }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
  })

  it('LEGACY settings: a stored single offsetHours behaves as a one-touch journey', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: { enabled: true, offsetHours: 48 } }]
    seedCandidate('a1', 20)
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(logReminderSentMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'auto_reminder_48h' }),
    )
  })

  it('a CONFIRMED visit gets the gentler variant (plain signed email, no confirm button)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { status: 'confirmed' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1)
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('skips a candidate whose detail has no email (defensive)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a2', 20, { email: null })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
  })

  it('handles a clinic with no candidates cleanly', async () => {
    state.profiles = [{ organizationId: 'org_empty', reminderSettings: null }]
    const r = await runDueReminders({ now: NOW })
    expect(r.orgsScanned).toBe(1)
    expect(r.sent).toBe(0)
  })
})

describe('runDueReminders — family consolidation', () => {
  it('two same-day visits to the same inbox collapse into ONE email with a log row each', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    // Jun 11 04:00 + 06:00 America/New_York — same clinic-local day, same inbox.
    seedCandidate('kid1', 20)
    seedCandidate('kid2', 22)
    logQueue = [[], []]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(2) // both visits count as reminded…
    expect(deliverMock).toHaveBeenCalledTimes(1) // …through a single email
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()
    expect(logReminderSentMock).toHaveBeenCalledTimes(2) // per-touch idempotency intact
    expect(logReminderSentMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'kid1', template: 'auto_reminder_24h' }),
    )
    expect(logReminderSentMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'kid2', template: 'auto_reminder_24h' }),
    )
  })

  it('same inbox on DIFFERENT clinic-local days stays two separate reminders', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20) // Jun 11 clinic-local
    seedCandidate('a2', 60) // Jun 12 clinic-local (Jun 13 00:00Z → Jun 12 20:00 EDT)
    logQueue = [[], []]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(2)
    expect(deliverMock).toHaveBeenCalledTimes(2) // two individual confirm-cta emails
  })

  it('different inboxes on the same day stay individual', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: 'mia@example.com' })
    seedCandidate('a2', 22, { email: 'noah@example.com' })
    logQueue = [[], []]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(2)
    expect(deliverMock).toHaveBeenCalledTimes(2)
  })

  it('an email-less dependent is reminded at the guardian’s address', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('dep1', 20, { email: null, guardianPatientId: 'g_mom' })
    logQueue = [[]]
    state.guardianQueue = [[{ email: 'mom@example.com' }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(deliverMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mom@example.com' }))
  })

  it('guardian + dependent visits the same day consolidate into the guardian’s inbox', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('mom', 20, { email: 'mom@example.com' })
    seedCandidate('dep1', 22, { email: null, guardianPatientId: 'p_mom' })
    logQueue = [[], []]
    state.guardianQueue = [[{ email: 'mom@example.com' }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(2)
    expect(deliverMock).toHaveBeenCalledTimes(1)
    expect(deliverMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mom@example.com' }))
  })

  it('an email-less dependent with NO guardian email is skipped (unchanged)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('dep1', 20, { email: null, guardianPatientId: 'g_gone' })
    logQueue = [[]]
    state.guardianQueue = [[]] // guardian row not found

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
  })
})
