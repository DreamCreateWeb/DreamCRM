import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Guard-logic coverage for createAndSendReviewRequest — the send path was
 * previously only manually verified. The guards here are compliance- and
 * UX-critical: never email an opted-out patient, never exceed the
 * per-patient rate limit, never send without a configured platform. Resend
 * + db are mocked so no real email is sent.
 */

const state = {
  patient: null as Record<string, unknown> | null,
  config: null as Record<string, unknown> | null,
  recent: null as Record<string, unknown> | null,
  org: { name: 'Acme Dental' } as Record<string, unknown> | null,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
  sentEmails: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            if (t === 'patient') return state.patient ? [state.patient] : []
            if (t === 'clinicReviewConfig') return state.config ? [state.config] : []
            if (t === 'reviewRequest') return state.recent ? [state.recent] : []
            if (t === 'organization') return state.org ? [state.org] : []
            return []
          },
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => { state.inserts.push({ table: String(t), values }) },
    }),
    update: (t: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => { state.updates.push({ table: String(t), set }) },
      }),
    }),
  },
  schema: {
    patient: 'patient',
    clinicReviewConfig: 'clinicReviewConfig',
    reviewRequest: 'reviewRequest',
    organization: 'organization',
  },
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (payload: Record<string, unknown>) => { state.sentEmails.push(payload); return { id: 'mock' } } }
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  desc: vi.fn((x) => x),
  count: vi.fn(() => ({ _: 'count' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

import { createAndSendReviewRequest } from '@/lib/services/reviews'

const OK_PATIENT = { id: 'pat_1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@example.com', marketingEmailOptIn: 1 }
const OK_CONFIG = { googlePlaceId: 'ChIJ_abc', healthgradesUrl: null, facebookPageId: null, yelpBusinessSlug: null, minDaysBetweenRequests: 365, npsEnabled: 0, autoSendEnabled: 0, autoSendDelayHours: 24, privateFeedbackEmail: null }

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test_key'
  state.patient = { ...OK_PATIENT }
  state.config = { ...OK_CONFIG }
  state.recent = null
  state.org = { name: 'Acme Dental' }
  state.inserts = []
  state.updates = []
  state.sentEmails = []
})

const baseInput = { organizationId: 'org_1', patientId: 'pat_1', channel: 'email' as const, requestedByUserId: 'user_1' }

describe('createAndSendReviewRequest — guards', () => {
  it('rejects the SMS channel (Phase B not shipped)', async () => {
    await expect(createAndSendReviewRequest({ ...baseInput, channel: 'sms' })).rejects.toThrow(/SMS channel is not enabled/i)
    expect(state.inserts).toHaveLength(0)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('throws when the patient is not found', async () => {
    state.patient = null
    await expect(createAndSendReviewRequest(baseInput)).rejects.toThrow(/not found/i)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('throws when the patient has no email', async () => {
    state.patient = { ...OK_PATIENT, email: null }
    await expect(createAndSendReviewRequest(baseInput)).rejects.toThrow(/no email/i)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('COMPLIANCE: refuses to send to a patient who opted out of marketing email', async () => {
    state.patient = { ...OK_PATIENT, marketingEmailOptIn: 0 }
    await expect(createAndSendReviewRequest(baseInput)).rejects.toThrow(/opted out/i)
    expect(state.inserts).toHaveLength(0)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('throws when no review platform is configured', async () => {
    state.config = { ...OK_CONFIG, googlePlaceId: null } // nothing configured
    await expect(createAndSendReviewRequest(baseInput)).rejects.toThrow(/No review platforms configured/i)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('enforces the rate limit — refuses if asked within the window', async () => {
    state.recent = { id: 'rr_prev' } // a recent request exists
    await expect(createAndSendReviewRequest(baseInput)).rejects.toThrow(/already asked within the last 365 days/i)
    expect(state.inserts).toHaveLength(0)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('happy path: inserts a pending request, sends the email, flips status to sent', async () => {
    const out = await createAndSendReviewRequest(baseInput)
    expect(out.id).toBeTruthy()
    expect(out.token).toBeTruthy()
    // review_request inserted as pending
    const insert = state.inserts.find((i) => i.table === 'reviewRequest')!
    expect(insert.values.status).toBe('pending')
    expect(insert.values.patientId).toBe('pat_1')
    expect(insert.values.token).toBe(out.token)
    // email actually attempted (to the patient, mocked Resend)
    expect(state.sentEmails).toHaveLength(1)
    expect(state.sentEmails[0].to).toBe('mia@example.com')
    // status flipped to 'sent' after the email succeeds
    const sentUpdate = state.updates.find((u) => u.set.status === 'sent')
    expect(sentUpdate).toBeTruthy()
  })

  it('marks the request failed (and rethrows) when the email send throws', async () => {
    delete process.env.RESEND_API_KEY // sendReviewRequestEmail throws on missing key
    await expect(createAndSendReviewRequest(baseInput)).rejects.toThrow(/RESEND_API_KEY/i)
    // request row still inserted, then flipped to 'failed'
    expect(state.inserts.find((i) => i.table === 'reviewRequest')).toBeTruthy()
    const failedUpdate = state.updates.find((u) => u.set.status === 'failed')
    expect(failedUpdate).toBeTruthy()
  })
})
