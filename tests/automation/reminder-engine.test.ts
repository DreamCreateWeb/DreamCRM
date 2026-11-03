import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prewarm } from '../prewarm'

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
  patientPhone?: string | null
  startTime: Date
  status?: string
}

const NOW = new Date('2026-06-10T12:00:00Z')
const HOUR = 60 * 60 * 1000
const inHours = (h: number) => new Date(NOW.getTime() + h * HOUR)
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR)

const state = {
  profiles: [] as Array<{ organizationId: string; reminderSettings: unknown; timezone?: string }>,
  candidates: [] as Array<{
    appointmentId: string
    patientId: string
    startTime: Date
    guardianPatientId?: string | null
    // The just-booked rule's facts (lib/reminder-hours.ts). Absent on the
    // older fixtures, where the rule must stand aside.
    createdAt?: Date | null
    source?: string | null
    patientEmail?: string | null
  }>,
  details: new Map<string, ApptDetail>(),
  // from(patient) queries, shifted in call order. Two callers share it:
  // guardian lookups (per email-less linked candidate) and the SMS path's
  // standing-STOP scan (once per text actually attempted).
  guardianQueue: [] as Array<Array<Record<string, unknown>>>,
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

// The Guardian's failure door (Phase 4 open item #1) — a collaborator here,
// with its own tests in tests/journey/engine-failures.ts. Mocked so these
// harnesses' slim db stubs don't have to model the ledger write.
vi.mock('@/lib/services/engine-failures', () => ({
  reportAutomationFailure: vi.fn(async () => true),
}))

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

// The reminder CLAIM (the double-send guard). The engine reserves a log row
// BEFORE it sends and confirms it after, so the harness models all three
// steps: `claimAutomatedReminder` hands back a claim (or null when a racing
// tick already holds it — `claimLosses` seeds those refusals), and the engine
// is expected to confirm exactly what landed and release exactly what didn't.
const { claimAutomatedReminderMock, confirmReminderSentMock, releaseReminderClaimMock, logReminderSentMock } =
  vi.hoisted(() => ({
    claimAutomatedReminderMock: vi.fn(),
    confirmReminderSentMock: vi.fn(async () => {}),
    releaseReminderClaimMock: vi.fn(async () => {}),
    logReminderSentMock: vi.fn(async () => 'rem_1'),
  }))
/** Appointment ids whose claim the next tick must lose (another tick owns it). */
let claimLosses = new Set<string>()
let claimSeq = 0
vi.mock('@/lib/services/appointments', () => ({
  logReminderSent: logReminderSentMock,
  claimAutomatedReminder: claimAutomatedReminderMock,
  confirmReminderSent: confirmReminderSentMock,
  releaseReminderClaim: releaseReminderClaimMock,
  getAppointmentDetail: vi.fn(async (_org: string, id: string) => {
    const d = state.details.get(id)
    if (!d) return null
    return {
      id: d.id,
      type: 'cleaning',
      status: d.status ?? 'scheduled',
      startTime: d.startTime,
      patient: { id: `pat_${id}`, fullName: 'Sam Jones', email: d.patientEmail, phone: d.patientPhone ?? null },
    }
  }),
}))

// The SMS transport (Phase 5 limb 3). Default posture: driver off — every
// pre-existing test runs exactly as before the channel choice existed.
const { getClinicSmsIdentityMock, deliverSmsMock } = vi.hoisted(() => ({
  getClinicSmsIdentityMock: vi.fn(async (): Promise<Record<string, unknown>> => ({
    ok: false,
    reason: 'driver_off',
  })),
  deliverSmsMock: vi.fn(async (): Promise<Record<string, unknown>> => ({
    ok: true,
    messageId: 'sms_1',
    segments: 1,
  })),
}))
vi.mock('@/lib/sms', () => ({
  getClinicSmsIdentity: getClinicSmsIdentityMock,
  deliverSms: deliverSmsMock,
}))

import { runDueReminders } from '@/lib/services/reminder-automation'

function seedCandidate(
  id: string,
  startInHours: number,
  opts: {
    email?: string | null
    phone?: string | null
    status?: string
    guardianPatientId?: string
    createdAt?: Date
    source?: string
  } = {},
) {
  const startTime = inHours(startInHours)
  const email = opts.email === undefined ? 'sam@example.com' : opts.email
  state.candidates.push({
    appointmentId: id,
    patientId: `p_${id}`,
    startTime,
    guardianPatientId: opts.guardianPatientId ?? null,
    createdAt: opts.createdAt ?? null,
    source: opts.source ?? null,
    // The candidate scan joins the patient's own address — the same value
    // the detail carries.
    patientEmail: email,
  })
  state.details.set(id, {
    id,
    patientEmail: email,
    patientPhone: opts.phone ?? null,
    startTime,
    status: opts.status,
  })
}

// Load the module(s) under test during COLLECTION, so no single test is
// billed for the cold module graph (see tests/prewarm.ts).
prewarm(() => import('@/lib/services/engine-failures'))

beforeEach(() => {
  state.profiles = []
  state.candidates = []
  state.details = new Map()
  state.guardianQueue = []
  logQueue = []
  claimLosses = new Set()
  claimSeq = 0
  vi.clearAllMocks()
  claimAutomatedReminderMock.mockImplementation(
    async (input: { organizationId: string; appointmentId: string; channel: string; template: string }) =>
      claimLosses.has(input.appointmentId)
        ? null
        : { id: `rem_${++claimSeq}`, ...input },
  )
  confirmReminderSentMock.mockImplementation(async () => {})
  releaseReminderClaimMock.mockImplementation(async () => {})
  // Re-pin the SMS defaults — clearAllMocks clears calls, not implementations,
  // so a test that flipped texting on must not leak it into the next.
  getClinicSmsIdentityMock.mockImplementation(async () => ({ ok: false, reason: 'driver_off' }))
  deliverSmsMock.mockImplementation(async () => ({ ok: true, messageId: 'sms_1', segments: 1 }))
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
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', appointmentId: 'a1', template: 'auto_reminder_24h' }),
    )
    // Claimed before the send, confirmed after it — never the other way round.
    expect(confirmReminderSentMock).toHaveBeenCalledTimes(1)
    expect(releaseReminderClaimMock).not.toHaveBeenCalled()
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
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
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
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
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
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
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
    expect(claimAutomatedReminderMock).toHaveBeenCalledTimes(2) // per-touch idempotency intact
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'kid1', template: 'auto_reminder_24h' }),
    )
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
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

describe('runDueReminders — the SMS fallback (Phase 5 limb 3: the channel choice)', () => {
  const smsOn = () =>
    getClinicSmsIdentityMock.mockImplementation(async () => ({ ok: true, fromNumber: '+14155550100' }))

  it('texts a phone-only patient when the clinic’s texting is live', async () => {
    smsOn()
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: null, phone: '(415) 555-0142' })
    logQueue = [[]]
    state.guardianQueue = [[]] // the standing-STOP scan — nobody opted out

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(r.sentSms).toBe(1)
    expect(r.skipped).toBe(0)
    expect(deliverSmsMock).toHaveBeenCalledTimes(1)
    const [org, input] = deliverSmsMock.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(org).toBe('org_1')
    expect(input.to).toBe('+14155550142')
    expect(input.kind).toBe('transactional')
    // Unconfirmed → the same one-click confirm token the email journey uses.
    expect(String(input.body)).toContain('/c/ct_test_token')
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', template: 'auto_reminder_24h' }),
    )
    // providerMessageId is the DLR correlation key — a delivery receipt finds
    // the claimed row by it (lib/services/sms-dlr.ts), so it's stamped on at
    // confirm time, once the carrier has actually taken the message.
    expect(confirmReminderSentMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', template: 'auto_reminder_24h' }),
      { providerMessageId: 'sms_1' },
    )
    expect(deliverMock).not.toHaveBeenCalled()
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()
  })

  it('phone-only patients stay skipped when the clinic cannot text (the pre-SMS behavior)', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: null, phone: '(415) 555-0142' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(deliverSmsMock).not.toHaveBeenCalled()
  })

  it('email stays the primary channel — a patient with both gets the email, never a text', async () => {
    smsOn()
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { phone: '(415) 555-0142' }) // email defaults to sam@example.com
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(r.sentSms).toBe(0)
    expect(deliverMock).toHaveBeenCalledTimes(1)
    expect(deliverSmsMock).not.toHaveBeenCalled()
  })

  it('a CONFIRMED visit’s text is the gentler variant — no confirm link', async () => {
    smsOn()
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: null, phone: '(415) 555-0142', status: 'confirmed' })
    logQueue = [[]]
    state.guardianQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    const body = String((deliverSmsMock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1].body)
    expect(body).not.toContain('/c/')
    expect(body).toContain('See you')
  })

  it('a standing STOP silences even transactional reminders — skipped, not failed', async () => {
    smsOn()
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: null, phone: '(415) 555-0142' })
    logQueue = [[]]
    // The STOP scan finds the number opted out (however the desk spelled it).
    state.guardianQueue = [[{ phone: '415-555-0142', optOutAt: new Date('2026-06-01') }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.failed).toBe(0)
    expect(deliverSmsMock).not.toHaveBeenCalled()
  })

  it('a shared family phone gets ONE household text with a log row per visit', async () => {
    smsOn()
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('kid1', 20, { email: null, phone: '415-555-0142' })
    seedCandidate('kid2', 22, { email: null, phone: '(415) 555-0142' }) // same number, spelled differently
    logQueue = [[], []]
    state.guardianQueue = [[]] // one STOP scan for the household send

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(2)
    expect(r.sentSms).toBe(2)
    expect(deliverSmsMock).toHaveBeenCalledTimes(1)
    const body = String((deliverSmsMock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1].body)
    expect(body).toContain('family')
    expect(claimAutomatedReminderMock).toHaveBeenCalledTimes(2)
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'kid1', channel: 'sms' }),
    )
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'kid2', channel: 'sms' }),
    )
  })

  it('a dependent with no email anywhere is texted at the guardian’s number', async () => {
    smsOn()
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('dep1', 20, { email: null, guardianPatientId: 'g_mom' })
    logQueue = [[]]
    state.guardianQueue = [
      [{ email: null, phone: '415-555-0199' }], // the guardian fetch — no inbox, but a phone
      [], // the STOP scan
    ]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(1)
    expect(r.sentSms).toBe(1)
    const [, input] = deliverSmsMock.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(input.to).toBe('+14155550199')
  })

  it('a hard carrier failure counts as failed and tells the Guardian', async () => {
    smsOn()
    deliverSmsMock.mockResolvedValueOnce({
      ok: false,
      reason: 'failed',
      error: 'The text didn’t go out — nothing was sent.',
    })
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: null, phone: '(415) 555-0142' })
    logQueue = [[]]
    state.guardianQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    const { reportAutomationFailure } = await import('@/lib/services/engine-failures')
    expect(vi.mocked(reportAutomationFailure)).toHaveBeenCalledWith('org_1', 'reminders')
    // The claim was taken before the attempt — and handed straight back, so
    // the next tick can try again and the drawer never shows a phantom send.
    expect(claimAutomatedReminderMock).toHaveBeenCalledTimes(1)
    expect(confirmReminderSentMock).not.toHaveBeenCalled()
    expect(releaseReminderClaimMock).toHaveBeenCalledTimes(1)
  })

  it('an unapproved-mid-run refusal is a state, not a break — skipped, Guardian untouched', async () => {
    smsOn()
    deliverSmsMock.mockResolvedValueOnce({
      ok: false,
      reason: 'not_approved',
      error: 'This practice’s texting isn’t live yet — registration is still with the carriers.',
    })
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: null, phone: '(415) 555-0142' })
    logQueue = [[]]
    state.guardianQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.skipped).toBe(1)
    expect(r.failed).toBe(0)
    const { reportAutomationFailure } = await import('@/lib/services/engine-failures')
    expect(vi.mocked(reportAutomationFailure)).not.toHaveBeenCalled()
  })
})

/**
 * THE DOUBLE-SEND GUARD (the ranked #1 defect: the only open bug that reached
 * a patient's phone). The engine used to record a reminder AFTER it went out,
 * so two overlapping 30-minute ticks — or one tick retried — both read "not
 * sent yet" and both sent. Now the log row is CLAIMED first, on a partial
 * unique index, and the loser of that race sends nothing.
 */
describe('runDueReminders — the reminder claim (no double-sends)', () => {
  it('a tick that loses the claim sends nothing at all', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    // The prior-log read is EMPTY — exactly the overlapping-tick case: both
    // ticks pass the read, and only the claim can tell them apart.
    logQueue = [[]]
    claimLosses = new Set(['a1'])

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(0)
    // Counted as CONTENDED, not already-reminded: those mean different things
    // to whoever reads batch health.
    expect(r.claimContended).toBe(1)
    expect(r.alreadyReminded).toBe(0)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()
    expect(confirmReminderSentMock).not.toHaveBeenCalled()
    // Nothing was written, so there is nothing to give back.
    expect(releaseReminderClaimMock).not.toHaveBeenCalled()
  })

  it('claims BEFORE the send, not after — the whole point of the fix', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    logQueue = [[]]

    await runDueReminders({ now: NOW })
    const claimedAt = claimAutomatedReminderMock.mock.invocationCallOrder[0]
    const sentAt = deliverMock.mock.invocationCallOrder[0]
    const confirmedAt = confirmReminderSentMock.mock.invocationCallOrder[0]
    expect(claimedAt).toBeLessThan(sentAt)
    expect(sentAt).toBeLessThan(confirmedAt)
  })

  it('a claim that THROWS is treated as lost — an unreadable outcome never sends', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    logQueue = [[]]
    claimAutomatedReminderMock.mockRejectedValueOnce(new Error('connection terminated'))

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.claimContended).toBe(1)
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('a failed send hands the claim back, so the next tick can retry', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20)
    logQueue = [[]]
    deliverMock.mockRejectedValueOnce(new Error('mailer down'))

    const r = await runDueReminders({ now: NOW })
    expect(r.failed).toBe(1)
    expect(confirmReminderSentMock).not.toHaveBeenCalled()
    expect(releaseReminderClaimMock).toHaveBeenCalledTimes(1)
  })

  it('a family bucket claims every visit, and releases every one when the send fails', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('kid1', 20)
    seedCandidate('kid2', 22)
    logQueue = [[], []]
    deliverMock.mockRejectedValueOnce(new Error('mailer down'))

    const r = await runDueReminders({ now: NOW })
    expect(claimAutomatedReminderMock).toHaveBeenCalledTimes(2)
    expect(r.failed).toBe(2)
    expect(releaseReminderClaimMock).toHaveBeenCalledTimes(2)
    expect(confirmReminderSentMock).not.toHaveBeenCalled()
  })

  it('a family bucket drops only the visit another tick already owns', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('kid1', 20)
    seedCandidate('kid2', 22)
    logQueue = [[], []]
    claimLosses = new Set(['kid2'])

    const r = await runDueReminders({ now: NOW })
    expect(r.claimContended).toBe(1)
    // One visit left in the bucket → the single-visit email, not a household
    // one that would name a sibling this tick doesn't own.
    expect(r.sent).toBe(1)
    expect(deliverMock).toHaveBeenCalledTimes(1)
    expect(confirmReminderSentMock).toHaveBeenCalledTimes(1)
  })

  it('an EXPECTED non-send gives the claim back too — a standing STOP is not a spent touch', async () => {
    getClinicSmsIdentityMock.mockImplementation(async () => ({ ok: true, fromNumber: '+14155550100' }))
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { email: null, phone: '(415) 555-0142' })
    logQueue = [[]]
    // The STOP scan finds the number opted out: nothing goes out, so the touch
    // must not be burned — a START tomorrow should still get a reminder.
    state.guardianQueue = [[{ phone: '415-555-0142', optOutAt: new Date('2026-06-01') }]]

    const r = await runDueReminders({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(deliverSmsMock).not.toHaveBeenCalled()
    expect(releaseReminderClaimMock).toHaveBeenCalledTimes(1)
    expect(confirmReminderSentMock).not.toHaveBeenCalled()
  })
})

describe('runDueReminders — quiet hours (lib/reminder-hours.ts, rule 1)', () => {
  // NOW is 12:00Z: 8:00 AM in New York (the first allowed minute) and
  // 5:00 AM in Los Angeles. Every earlier test rides the default (Eastern).

  it('outside the window the org is held whole: nothing scanned, claimed or logged', async () => {
    state.profiles = [{ organizationId: 'org_la', reminderSettings: null, timezone: 'America/Los_Angeles' }]
    seedCandidate('a1', 20)
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.outsideWindow).toBe(1)
    expect(r.orgsScanned).toBe(0)
    expect(r.candidates).toBe(0)
    expect(r.sent).toBe(0)
    expect(claimAutomatedReminderMock).not.toHaveBeenCalled()
    expect(logReminderSentMock).not.toHaveBeenCalled()
    expect(deliverMock).not.toHaveBeenCalled()
    // The prior-log read never ran either — a held candidate leaves no trace
    // for the dedupe to swallow when the window opens.
    expect(logQueue).toHaveLength(1)
  })

  it('the first tick inside the window sends it, exactly as if the hold never happened', async () => {
    state.profiles = [{ organizationId: 'org_la', reminderSettings: null, timezone: 'America/Los_Angeles' }]
    seedCandidate('a1', 20)
    logQueue = [[]]

    await runDueReminders({ now: NOW }) // 5:00 AM Pacific — held
    const r = await runDueReminders({ now: inHours(3) }) // 8:00 AM Pacific
    expect(r.outsideWindow).toBe(0)
    expect(r.sent).toBe(1)
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', template: 'auto_reminder_24h' }),
    )
  })

  it('a 7 AM visit’s 24h touch opens at 7 AM — outside — and goes at the 8 AM tick, still as the 24h touch', async () => {
    state.profiles = [{ organizationId: 'org_ny', reminderSettings: null, timezone: 'America/New_York' }]
    const visit = new Date('2026-06-11T11:00:00Z') // 7:00 AM EDT, June 11
    state.candidates.push({ appointmentId: 'a7', patientId: 'p_a7', startTime: visit, guardianPatientId: null })
    state.details.set('a7', { id: 'a7', patientEmail: 'sam@example.com', startTime: visit })
    logQueue = [[]]

    const held = await runDueReminders({ now: new Date('2026-06-10T11:00:00Z') }) // 7:00 AM EDT, 24h out
    expect(held.outsideWindow).toBe(1)
    expect(held.sent).toBe(0)

    const r = await runDueReminders({ now: new Date('2026-06-10T12:00:00Z') }) // 8:00 AM EDT, 23h out
    expect(r.sent).toBe(1)
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a7', template: 'auto_reminder_24h' }),
    )
  })

  it('8 PM is outside and 7:59 PM is inside — on the clinic’s clock, not the server’s', async () => {
    state.profiles = [{ organizationId: 'org_ny', reminderSettings: null, timezone: 'America/New_York' }]
    seedCandidate('a1', 20)
    logQueue = [[]]

    const late = await runDueReminders({ now: new Date('2026-06-11T00:00:00Z') }) // 8:00 PM EDT, June 10
    expect(late.outsideWindow).toBe(1)
    expect(late.sent).toBe(0)

    const r = await runDueReminders({ now: new Date('2026-06-10T23:59:00Z') }) // 7:59 PM EDT
    expect(r.sent).toBe(1)
  })
})

describe('runDueReminders — just booked (lib/reminder-hours.ts, rule 2)', () => {
  it('a visit the platform confirmed 30 minutes ago is not reminded on the next tick — nothing claimed or logged', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { createdAt: hoursAgo(0.5), source: 'booking_widget' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.justBooked).toBe(1)
    expect(r.sent).toBe(0)
    expect(r.alreadyReminded).toBe(0)
    expect(r.skipped).toBe(0)
    expect(claimAutomatedReminderMock).not.toHaveBeenCalled()
    expect(logReminderSentMock).not.toHaveBeenCalled()
    expect(deliverMock).not.toHaveBeenCalled()
    // Decided before the idempotency read — the dedupe never saw it.
    expect(logQueue).toHaveLength(1)
  })

  it('the touch the visit was born inside stays the confirmation’s after the grace — no catch-up send', async () => {
    // Booked 3h ago for a visit 20h from now: 23h out at booking, so the 24h
    // window was already open — the confirmation WAS the 24h touch.
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { createdAt: hoursAgo(3), source: 'manual' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.justBooked).toBe(1)
    expect(r.sent).toBe(0)
    expect(claimAutomatedReminderMock).not.toHaveBeenCalled()
  })

  it('a visit booked three days out still gets its 24h reminder — that touch opened after the booking', async () => {
    // Booked 50h ago for a visit 20h from now: 70h out at booking; the 24h
    // window opened 46 hours later and is the visit's own.
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { createdAt: hoursAgo(50), source: 'booking_widget' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.justBooked).toBe(0)
    expect(r.sent).toBe(1)
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', template: 'auto_reminder_24h' }),
    )
  })

  it('a later touch still fires: the 4h-before of a visit booked this morning', async () => {
    // Journey [24, 4]; booked 3h ago for a visit 3h from now — 6h out at
    // booking, inside the 24h window, NOT inside the 4h one.
    state.profiles = [{ organizationId: 'org_1', reminderSettings: { touchOffsets: [24, 4] } }]
    seedCandidate('a1', 3, { createdAt: hoursAgo(3), source: 'booking_widget' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.justBooked).toBe(0)
    expect(r.sent).toBe(1)
    expect(claimAutomatedReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'auto_reminder_4h' }),
    )
  })

  it('a PMS-synced visit booked moments ago IS reminded — we confirmed nothing', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { createdAt: hoursAgo(0.5), source: 'pms' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.justBooked).toBe(0)
    expect(r.sent).toBe(1)
  })

  it('a patient with no address of their own got no confirmation — the rule stands aside and the text goes', async () => {
    getClinicSmsIdentityMock.mockImplementation(async () => ({ ok: true, fromNumber: '+14155550100' }))
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, {
      email: null,
      phone: '(415) 555-0142',
      createdAt: hoursAgo(0.5),
      source: 'booking_widget',
    })
    logQueue = [[]]
    state.guardianQueue = [[]] // the standing-STOP scan — nobody opted out

    const r = await runDueReminders({ now: NOW })
    expect(r.justBooked).toBe(0)
    expect(r.sentSms).toBe(1)
  })

  it('an older fixture with no createdAt is never mistaken for a fresh booking', async () => {
    state.profiles = [{ organizationId: 'org_1', reminderSettings: null }]
    seedCandidate('a1', 20, { source: 'booking_widget' })
    logQueue = [[]]

    const r = await runDueReminders({ now: NOW })
    expect(r.justBooked).toBe(0)
    expect(r.sent).toBe(1)
  })
})
