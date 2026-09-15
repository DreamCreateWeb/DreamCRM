import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prewarm } from '../prewarm'

/**
 * Orchestration-level coverage for autoSendDueReviewRequests.
 * The send path itself is covered exhaustively in send-request.test.ts;
 * this file verifies the cron wrapper:
 *   - only scans orgs with autoSendEnabled=1
 *   - skips orgs that haven't configured a review platform
 *   - categorizes expected guard misses (opted out / rate limit / no
 *     email / no platforms) as `skipped`, not `failed`
 *   - propagates unexpected errors into the errors array
 *   - per-appointment idempotency (no review_request row → eligible)
 */

const state = {
  orgs: [] as Array<{ organizationId: string; autoSendDelayHours: number }>,
  config: null as Record<string, unknown> | null,
  candidates: [] as Array<{ appointmentId: string; patientId: string }>,
  // Rows the per-appointment dedupe SELECT (in fireReviewRequestForAppointment)
  // returns. Empty = no existing request for the appointment → eligible to send.
  existingRequest: [] as unknown[],
  /** Per-ORG script for the config read, consumed one entry per org in list
   *  order. `'throw'` stands in for a read that blows up on that clinic. Empty
   *  → every org falls back to `config`. Used by the isolation tests. */
  configByOrg: [] as Array<Record<string, unknown> | 'throw'>,
  /** Same idea for the candidate scan. */
  candidatesByOrg: [] as Array<Array<{ appointmentId: string; patientId: string }> | 'throw'>,
}

vi.mock('@/lib/db', () => {
  type ChainShape = Promise<unknown[]> & {
    from: (t: unknown) => ChainShape
    leftJoin: () => ChainShape
    where: () => ChainShape
    orderBy: () => ChainShape
    limit: (n?: number) => ChainShape
  }
  function chain(rows: unknown[]): ChainShape {
    const p = Promise.resolve(rows) as ChainShape
    p.from = () => p
    p.leftJoin = () => p
    p.where = () => p
    p.orderBy = () => p
    p.limit = () => p
    return p
  }
  return {
    db: {
      select: (sel?: Record<string, unknown>) => {
        const keys = sel ? Object.keys(sel) : []
        // First-pass orgs scan: { organizationId, autoSendDelayHours }
        if (keys.includes('organizationId') && keys.includes('autoSendDelayHours')) {
          return chain(state.orgs)
        }
        // THE KILL's shutdown scan (listShutDownOrgIds) — runs once, before
        // the per-org walk. Named explicitly so it can't fall through and eat
        // an entry off the per-org scripts below.
        if (keys.includes('trialEndsAt')) return chain([])
        // Eligible candidates scan: { appointmentId, patientId }
        if (keys.includes('appointmentId') && keys.includes('patientId')) {
          if (state.candidatesByOrg.length > 0) {
            const nextC = state.candidatesByOrg.shift()!
            if (nextC === 'throw') throw new Error('candidate scan blew up')
            return chain(nextC)
          }
          return chain(state.candidates)
        }
        // Per-appointment dedupe SELECT ({ id } from reviewRequest) inside
        // fireReviewRequestForAppointment — empty = eligible to send.
        if (keys.length === 1 && keys.includes('id')) {
          return chain(state.existingRequest)
        }
        // getReviewConfig fallback (queries the whole row)
        if (state.configByOrg.length > 0) {
          const next = state.configByOrg.shift()!
          if (next === 'throw') throw new Error('config read blew up')
          return chain([next])
        }
        return chain(state.config ? [state.config] : [])
      },
    },
    schema: {
      clinicReviewConfig: 'clinicReviewConfig',
      appointment: 'appointment',
      reviewRequest: 'reviewRequest',
    },
  }
})

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
    replyTo: 'front@acmedental.com',
    name: 'Acme Dental',
  })),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  desc: vi.fn((x) => x),
  asc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _: 'gte' })),
  count: vi.fn(() => ({ _: 'count' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

// Stub the send call via the autoSendDueReviewRequests `sendFn` DI
// hook — the inner createAndSendReviewRequest has its own dedicated
// guard-logic test file (send-request.test.ts), so reaching into it
// from here would only duplicate coverage and re-test guards that
// already work. The injected stub lets us assert orchestration in
// isolation (counters / error categorization).
const sendStub = vi.fn()

const COMPLETE_CONFIG = {
  googlePlaceId: 'ChIJ_abc',
  healthgradesUrl: null,
  facebookPageId: null,
  yelpBusinessSlug: null,
  minDaysBetweenRequests: 365,
  npsEnabled: 0,
  autoSendEnabled: 1,
  autoSendDelayHours: 24,
  privateFeedbackEmail: null,
}

// Load the module(s) under test during COLLECTION, so no single test is
// billed for the cold module graph (see tests/prewarm.ts).
prewarm(
  () => import('@/lib/services/reviews'),
  () => import('drizzle-orm'),
)

beforeEach(() => {
  state.orgs = []
  state.config = null
  state.candidates = []
  state.existingRequest = []
  state.configByOrg = []
  state.candidatesByOrg = []
  sendStub.mockReset()
})

// Cast through unknown because the production sendFn returns a richer
// object; the orchestration only awaits it and counts result.sent.
const sendFn = sendStub as unknown as Parameters<typeof import('@/lib/services/reviews').autoSendDueReviewRequests>[0] extends infer T
  ? T extends { sendFn?: infer F } ? F : never
  : never

async function callAutoSend() {
  const { autoSendDueReviewRequests } = await import('@/lib/services/reviews')
  return autoSendDueReviewRequests({ now: new Date('2026-05-28T12:00:00Z'), sendFn })
}

describe('autoSendDueReviewRequests', () => {
  it('returns zeros when no org has autoSendEnabled=1', async () => {
    state.orgs = []
    const r = await callAutoSend()
    expect(r).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0, errors: [] })
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('skips an org with autoSendEnabled but no review platform configured', async () => {
    state.orgs = [{ organizationId: 'org_1', autoSendDelayHours: 24 }]
    state.config = { ...COMPLETE_CONFIG, googlePlaceId: null }
    state.candidates = [{ appointmentId: 'apt_1', patientId: 'pat_1' }]
    const r = await callAutoSend()
    expect(r.sent).toBe(0)
    expect(r.scanned).toBe(0)
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('fires a send for each eligible candidate, counts result.sent', async () => {
    state.orgs = [{ organizationId: 'org_1', autoSendDelayHours: 24 }]
    state.config = COMPLETE_CONFIG
    state.candidates = [
      { appointmentId: 'apt_1', patientId: 'pat_1' },
      { appointmentId: 'apt_2', patientId: 'pat_2' },
    ]
    sendStub.mockResolvedValue({ id: 'rr_x', token: 'tok_x' })
    const r = await callAutoSend()
    expect(r.scanned).toBe(2)
    expect(r.sent).toBe(2)
    expect(r.skipped).toBe(0)
    expect(r.failed).toBe(0)
    expect(sendStub).toHaveBeenCalledTimes(2)
    // System-initiated sends pass requestedByUserId=null
    expect(sendStub).toHaveBeenCalledWith(
      expect.objectContaining({ requestedByUserId: null, channel: 'email' }),
    )
  })

  it('skips (no send) when a review_request already exists for the appointment', async () => {
    state.orgs = [{ organizationId: 'org_1', autoSendDelayHours: 24 }]
    state.config = COMPLETE_CONFIG
    state.candidates = [{ appointmentId: 'apt_1', patientId: 'pat_1' }]
    // The per-appointment dedupe SELECT finds an existing row → skip, never send.
    state.existingRequest = [{ id: 'rr_existing' }]
    const r = await callAutoSend()
    expect(r.scanned).toBe(1)
    expect(r.skipped).toBe(1)
    expect(r.sent).toBe(0)
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('categorizes guard-miss errors as skipped, not failed', async () => {
    state.orgs = [{ organizationId: 'org_1', autoSendDelayHours: 24 }]
    state.config = COMPLETE_CONFIG
    state.candidates = [
      { appointmentId: 'apt_1', patientId: 'pat_1' },
      { appointmentId: 'apt_2', patientId: 'pat_2' },
      { appointmentId: 'apt_3', patientId: 'pat_3' },
      { appointmentId: 'apt_4', patientId: 'pat_4' },
    ]
    sendStub
      .mockRejectedValueOnce(new Error('Patient has opted out of marketing email'))
      .mockRejectedValueOnce(new Error('Patient has no email address on file'))
      .mockRejectedValueOnce(new Error('This patient was already asked within the last 365 days. Wait it out…'))
      .mockRejectedValueOnce(new Error('No review platforms configured.'))
    const r = await callAutoSend()
    expect(r.scanned).toBe(4)
    expect(r.skipped).toBe(4)
    expect(r.sent).toBe(0)
    expect(r.failed).toBe(0)
    expect(r.errors).toEqual([])
  })

  it('surfaces unexpected errors via result.failed + errors array', async () => {
    state.orgs = [{ organizationId: 'org_1', autoSendDelayHours: 24 }]
    state.config = COMPLETE_CONFIG
    state.candidates = [{ appointmentId: 'apt_1', patientId: 'pat_1' }]
    sendStub.mockRejectedValueOnce(new Error('Resend 503 — backend boom'))
    const r = await callAutoSend()
    expect(r.failed).toBe(1)
    expect(r.skipped).toBe(0)
    expect(r.sent).toBe(0)
    expect(r.errors).toEqual([
      { organizationId: 'org_1', appointmentId: 'apt_1', error: 'Resend 503 — backend boom' },
    ])
  })

  it('applies the 7-day ask-while-fresh floor to the candidates scan', async () => {
    // Flipping auto-send ON (or a long cron outage) must never blast requests
    // for months-old visits — the query carries a completedAt >= now-7d floor.
    state.orgs = [{ organizationId: 'org_1', autoSendDelayHours: 24 }]
    state.config = COMPLETE_CONFIG
    state.candidates = []
    const { gte } = await import('drizzle-orm')
    const gteMock = gte as unknown as ReturnType<typeof vi.fn>
    gteMock.mockClear()
    await callAutoSend()
    const now = new Date('2026-05-28T12:00:00Z')
    const expectedFloor = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const floorCall = gteMock.mock.calls.find(
      (c: unknown[]) => c[1] instanceof Date && (c[1] as Date).getTime() === expectedFloor.getTime(),
    )
    expect(floorCall).toBeTruthy()
  })
  // ── DREAMCRM-57 ────────────────────────────────────────────────────────────

  it("a clinic whose review-config read throws does not stop the NEXT clinic's sends", async () => {
    state.orgs = [
      { organizationId: 'org_boom', autoSendDelayHours: 24 },
      { organizationId: 'org_after', autoSendDelayHours: 24 },
    ]
    state.configByOrg = ['throw', COMPLETE_CONFIG]
    state.candidatesByOrg = [[{ appointmentId: 'apt_2', patientId: 'pat_2' }]]
    sendStub.mockResolvedValue({ id: 'rr_x', token: 'tok_x' })

    const r = await callAutoSend()

    // org_after, LATER in the list, still got its send. Before the per-org
    // try/catch the throw escaped the loop and it was never reached.
    expect(r.sent).toBe(1)
    expect(sendStub).toHaveBeenCalledTimes(1)
    // …and the clinic that broke is REPORTED rather than swallowed. An
    // org-level failure carries no appointment, hence the null.
    expect(r.failed).toBe(1)
    expect(r.errors).toEqual([
      { organizationId: 'org_boom', appointmentId: null, error: 'config read blew up' },
    ])
  })

  it("a clinic whose candidate scan throws does not stop the NEXT clinic's sends", async () => {
    state.orgs = [
      { organizationId: 'org_boom', autoSendDelayHours: 24 },
      { organizationId: 'org_after', autoSendDelayHours: 24 },
    ]
    state.configByOrg = [COMPLETE_CONFIG, COMPLETE_CONFIG]
    state.candidatesByOrg = ['throw', [{ appointmentId: 'apt_2', patientId: 'pat_2' }]]
    sendStub.mockResolvedValue({ id: 'rr_x', token: 'tok_x' })

    const r = await callAutoSend()

    expect(r.sent).toBe(1)
    expect(r.failed).toBe(1)
    expect(r.errors[0]).toEqual({
      organizationId: 'org_boom',
      appointmentId: null,
      error: 'candidate scan blew up',
    })
  })

  it('an idempotency read that throws costs ONE appointment, not the rest of the clinic', async () => {
    // The dedupe SELECT inside fireReviewRequestForAppointment used to sit
    // OUTSIDE its try, so a blip on appointment #1 abandoned #2 and #3 — and
    // every clinic after this one.
    state.orgs = [{ organizationId: 'org_1', autoSendDelayHours: 24 }]
    state.config = COMPLETE_CONFIG
    state.candidates = [
      { appointmentId: 'apt_1', patientId: 'pat_1' },
      { appointmentId: 'apt_2', patientId: 'pat_2' },
    ]
    let dedupeCalls = 0
    Object.defineProperty(state, 'existingRequest', {
      configurable: true,
      get() {
        dedupeCalls++
        if (dedupeCalls === 1) throw new Error('dedupe read blew up')
        return []
      },
    })
    sendStub.mockResolvedValue({ id: 'rr_x', token: 'tok_x' })

    const r = await callAutoSend()

    expect(r.scanned).toBe(2)
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(1)
    expect(r.errors[0]).toEqual({
      organizationId: 'org_1',
      appointmentId: 'apt_1',
      error: 'dedupe read blew up',
    })
    delete (state as Record<string, unknown>).existingRequest
    ;(state as Record<string, unknown>).existingRequest = []
  })
})
