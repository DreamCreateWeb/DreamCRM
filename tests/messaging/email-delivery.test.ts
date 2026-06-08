import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The "email" channel of the Patient Communications inbox must actually deliver
 * the message to the patient (the composer shows a literal "Send email" button).
 * Previously it only recorded a patient_message row and never emailed anyone.
 */

const state = {
  patient: null as null | { id: string; email: string | null; firstName: string },
  profile: null as null | { displayName: string | null; email: string | null },
  threadExists: false,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const handler = {
    select: (_sel?: unknown) => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            if (t === 'patient') return state.patient ? [state.patient] : []
            if (t === 'clinicProfile') return state.profile ? [state.profile] : []
            if (t === 'organization') return [{ name: 'Fallback Org' }]
            if (t === 'patientThread') return state.threadExists ? [{ id: 'thr_1' }] : []
            return []
          },
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: String(t), values })
      },
    }),
    update: (t: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => { state.updates.push({ table: String(t), set }) },
      }),
    }),
  }
  return {
    db: handler,
    schema: {
      patient: 'patient',
      clinicProfile: 'clinicProfile',
      organization: 'organization',
      patientThread: 'patientThread',
      patientMessage: 'patientMessage',
      emailMessage: 'emailMessage',
      user: 'user',
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  desc: vi.fn(() => ({ _: 'desc' })),
  asc: vi.fn(() => ({ _: 'asc' })),
  ilike: vi.fn(() => ({ _: 'ilike' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  count: vi.fn(() => ({ _: 'count' })),
  or: vi.fn(() => ({ _: 'or' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

const sendEmailSpy = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/email', () => ({
  sendPatientMessageEmail: (...args: unknown[]) => sendEmailSpy(...args),
}))

// The clinic sender identity is resolved here; mock it so the message-send
// path doesn't hit the DB. getClinicSenderIdentity has its own unit test.
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
    replyTo: 'front@acme.com',
    name: 'Acme Dental',
  })),
}))

beforeEach(() => {
  state.patient = { id: 'pat_1', email: 'mia@example.com', firstName: 'Mia' }
  state.profile = { displayName: 'Acme Dental', email: 'front@acme.com' }
  state.threadExists = true
  state.inserts = []
  state.updates = []
  sendEmailSpy.mockClear()
  sendEmailSpy.mockResolvedValue(undefined)
})

describe('sendMessageToPatient — email channel delivery', () => {
  it('actually emails the patient (with clinic name + reply-to) and records the row', async () => {
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await sendMessageToPatient({
      organizationId: 'org_1',
      patientId: 'pat_1',
      body: 'Your results look great — see you next visit!',
      channel: 'email',
      sentByUserId: 'usr_1',
    })
    expect(sendEmailSpy).toHaveBeenCalledOnce()
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'mia@example.com',
        patientFirstName: 'Mia',
        clinicName: 'Acme Dental',
        from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
        replyTo: 'front@acme.com',
        body: expect.stringContaining('results look great'),
      }),
    )
    // The thread row is recorded too.
    expect(state.inserts.some((i) => i.table === 'patientMessage' && i.values.channel === 'email')).toBe(true)
  })

  it('does NOT record a message row when the email send fails', async () => {
    sendEmailSpy.mockRejectedValueOnce(new Error('outbound email is in test mode'))
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await expect(
      sendMessageToPatient({
        organizationId: 'org_1',
        patientId: 'pat_1',
        body: 'hello',
        channel: 'email',
        sentByUserId: 'usr_1',
      }),
    ).rejects.toThrow(/test mode/i)
    expect(state.inserts.some((i) => i.table === 'patientMessage')).toBe(false)
  })

  it('rejects the email channel when the patient has no email on file', async () => {
    state.patient = { id: 'pat_1', email: null, firstName: 'Mia' }
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await expect(
      sendMessageToPatient({
        organizationId: 'org_1',
        patientId: 'pat_1',
        body: 'hello',
        channel: 'email',
        sentByUserId: 'usr_1',
      }),
    ).rejects.toThrow(/no email address on file/i)
    expect(sendEmailSpy).not.toHaveBeenCalled()
    expect(state.inserts).toHaveLength(0)
  })

  it('does NOT email on the in_app channel (portal-only)', async () => {
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await sendMessageToPatient({
      organizationId: 'org_1',
      patientId: 'pat_1',
      body: 'in-app note',
      channel: 'in_app',
      sentByUserId: 'usr_1',
    })
    expect(sendEmailSpy).not.toHaveBeenCalled()
    expect(state.inserts.some((i) => i.table === 'patientMessage' && i.values.channel === 'in_app')).toBe(true)
  })

  // (The non-deliverable-Reply-To guard now lives in getClinicSenderIdentity /
  // deliverableReplyTo — covered by the deliverableReplyTo block below + the
  // clinic-sender unit test.)
})

describe('deliverableReplyTo', () => {
  it('accepts a real clinic address', async () => {
    const { deliverableReplyTo } = await import('@/lib/services/patient-messaging')
    expect(deliverableReplyTo('front@smilebright.com')).toBe('front@smilebright.com')
    expect(deliverableReplyTo('  Front@SmileBright.com  ')).toBe('Front@SmileBright.com')
  })

  it('rejects reserved / non-routable domains so replies never bounce', async () => {
    const { deliverableReplyTo } = await import('@/lib/services/patient-messaging')
    for (const bad of [
      'hello@acme-dental.example',
      'x@foo.test',
      'x@foo.invalid',
      'x@localhost',
      'x@example.com',
      'x@sub.example.org',
    ]) {
      expect(deliverableReplyTo(bad), bad).toBeNull()
    }
  })

  it('rejects empty / malformed addresses', async () => {
    const { deliverableReplyTo } = await import('@/lib/services/patient-messaging')
    for (const bad of [null, undefined, '', '   ', 'no-at-sign', 'trailing@', '@leading.com', 'no-dot@domain']) {
      expect(deliverableReplyTo(bad as string | null)).toBeNull()
    }
  })
})
