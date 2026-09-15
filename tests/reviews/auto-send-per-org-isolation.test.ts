import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prewarm } from '../prewarm'

/**
 * The per-org walk inside autoSendDueReviewRequests must isolate one clinic's
 * failure from every clinic behind it in the same run.
 *
 * The defect: only the SEND was wrapped (inside
 * fireReviewRequestForAppointment). Everything else the loop body does per org
 * — the review-config read, the candidates scan, the per-appointment dedupe
 * SELECT — ran bare, so a DB blip on ONE clinic threw straight out of
 * `for (const org of orgs)`. The cron returned a 500, the orgs behind that one
 * were never scanned, and (because the orgs list is in whatever order the
 * config table hands back) which tenants lost their hour was arbitrary.
 *
 * These cases exercise the two bare awaits that actually reach the database
 * per org. They are ORCHESTRATION cases: the send path has its own file.
 */

const ORGS_SCAN = 'orgs-scan'

const state = {
  orgs: [] as Array<{ organizationId: string; autoSendDelayHours: number }>,
  /** Per-org review-config row, or the literal 'throw' to make the read fail. */
  configByOrg: {} as Record<string, Record<string, unknown> | 'throw'>,
  /** Per-org due-appointment scan result, or 'throw' to make the scan fail. */
  candidatesByOrg: {} as Record<string, Array<{ appointmentId: string; patientId: string }> | 'throw'>,
}

/** Walk a mocked drizzle predicate for the org id it filters on. */
function orgIdFrom(where: unknown): string | null {
  if (!where || typeof where !== 'object') return null
  const node = where as { _?: string; val?: unknown; parts?: unknown[] }
  if (node._ === 'eq' && typeof node.val === 'string' && node.val.startsWith('org_')) return node.val
  for (const part of node.parts ?? []) {
    const found = orgIdFrom(part)
    if (found) return found
  }
  return null
}

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ _: 'and', parts }),
  or: (...parts: unknown[]) => ({ _: 'or', parts }),
  eq: (col: unknown, val: unknown) => ({ _: 'eq', col, val }),
  ne: () => ({ _: 'ne' }),
  lte: () => ({ _: 'lte' }),
  gte: () => ({ _: 'gte' }),
  isNull: () => ({ _: 'isNull' }),
  isNotNull: () => ({ _: 'isNotNull' }),
  inArray: () => ({ _: 'inArray' }),
  desc: (x: unknown) => x,
  asc: (x: unknown) => x,
  count: () => ({ _: 'count' }),
  sql: Object.assign(() => ({ _: 'sql' }), { raw: () => ({ _: 'raw' }) }),
}))

// The shutdown list is its own concern (and its own tests) — hold it empty so
// every seeded org reaches the loop body these cases are about.
vi.mock('@/lib/services/billing-state', () => ({
  listShutDownOrgIds: async () => new Set<string>(),
}))

vi.mock('@/lib/db', () => {
  type Ctx = { keys: string[]; where?: unknown }

  function rowsFor(ctx: Ctx): unknown[] {
    // listShutDownOrgIds is mocked away; the remaining reads are the loop's.
    if (ctx.keys.includes('autoSendDelayHours') && ctx.keys.includes('organizationId')) {
      return state.orgs
    }
    if (ctx.keys.includes('appointmentId')) {
      const rows = state.candidatesByOrg[orgIdFrom(ctx.where) ?? ORGS_SCAN]
      if (rows === 'throw') throw new Error('candidates scan: connection reset')
      return rows ?? []
    }
    // The per-appointment dedupe SELECT ({ id } from reviewRequest): empty
    // means no request points at the appointment yet, so it is eligible.
    if (ctx.keys.length === 1 && ctx.keys.includes('id')) return []
    // db.select() with no projection — getReviewConfig's whole-row read.
    const config = state.configByOrg[orgIdFrom(ctx.where) ?? ORGS_SCAN]
    if (config === 'throw') throw new Error('review config read: connection reset')
    return config ? [config] : []
  }

  function chain(keys: string[]) {
    const ctx: Ctx = { keys }
    const c = {
      from: () => c,
      leftJoin: () => c,
      where: (w: unknown) => {
        ctx.where = w
        return c
      },
      orderBy: () => c,
      limit: () => c,
      then: (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => rowsFor(ctx))
          .then(res, rej),
    }
    return c
  }

  return {
    db: { select: (sel?: Record<string, unknown>) => chain(sel ? Object.keys(sel) : []) },
    schema: {
      clinicReviewConfig: 'clinicReviewConfig',
      appointment: 'appointment',
      reviewRequest: 'reviewRequest',
    },
  }
})

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({ from: 'x', replyTo: null, name: 'Acme Dental' })),
}))

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

prewarm(() => import('@/lib/services/reviews'))

beforeEach(() => {
  state.orgs = []
  state.configByOrg = {}
  state.candidatesByOrg = {}
  sendStub.mockReset()
  sendStub.mockResolvedValue({ id: 'rr_x', token: 'tok_x' })
})

async function callAutoSend() {
  const { autoSendDueReviewRequests } = await import('@/lib/services/reviews')
  return autoSendDueReviewRequests({
    now: new Date('2026-05-28T12:00:00Z'),
    sendFn: sendStub as never,
  })
}

describe('autoSendDueReviewRequests per-org isolation', () => {
  it('still sends for the next clinic when the one before it throws reading its review config', async () => {
    state.orgs = [
      { organizationId: 'org_1', autoSendDelayHours: 24 },
      { organizationId: 'org_2', autoSendDelayHours: 24 },
    ]
    state.configByOrg = { org_1: 'throw', org_2: COMPLETE_CONFIG }
    state.candidatesByOrg = { org_2: [{ appointmentId: 'apt_2', patientId: 'pat_2' }] }

    const r = await callAutoSend()

    expect(sendStub).toHaveBeenCalledTimes(1)
    expect(sendStub).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org_2' }))
    expect(r.sent).toBe(1)
  })

  it('still sends for the next clinic when the one before it throws scanning its due appointments', async () => {
    state.orgs = [
      { organizationId: 'org_1', autoSendDelayHours: 24 },
      { organizationId: 'org_2', autoSendDelayHours: 24 },
    ]
    state.configByOrg = { org_1: COMPLETE_CONFIG, org_2: COMPLETE_CONFIG }
    state.candidatesByOrg = {
      org_1: 'throw',
      org_2: [{ appointmentId: 'apt_2', patientId: 'pat_2' }],
    }

    const r = await callAutoSend()

    expect(sendStub).toHaveBeenCalledTimes(1)
    expect(sendStub).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org_2' }))
    expect(r.sent).toBe(1)
  })

  it('reports the clinic that threw in errors with a null appointmentId, so the batch health read is honest', async () => {
    state.orgs = [
      { organizationId: 'org_1', autoSendDelayHours: 24 },
      { organizationId: 'org_2', autoSendDelayHours: 24 },
    ]
    state.configByOrg = { org_1: 'throw', org_2: COMPLETE_CONFIG }
    state.candidatesByOrg = { org_2: [{ appointmentId: 'apt_2', patientId: 'pat_2' }] }

    const r = await callAutoSend()

    expect(r.failed).toBe(1)
    expect(r.errors).toEqual([
      {
        organizationId: 'org_1',
        appointmentId: null,
        error: expect.stringContaining('review config read'),
      },
    ])
  })
})
