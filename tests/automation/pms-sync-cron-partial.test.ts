import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The hourly PMS auto-sync cron must treat a BUDGET-capped partial
 * (resumeAvailable) as healthy progress — NOT a failure. A large first import
 * legitimately returns `status:'partial'` every hour until it catches up;
 * alerting on it would spam the clinic. Only a real error / data-skip partial
 * (resumeAvailable === false) trips the failure-streak alert.
 */

// Sequenced select results: connections query first, then any streak queries.
const selectQueue: unknown[][] = []
// The Guardian's failure door (Phase 4 open item #1) — a collaborator here,
// with its own tests in tests/journey/engine-failures.ts. Mocked so these
// harnesses' slim db stubs don't have to model the ledger write.
const reportAutomationFailure = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => true))
vi.mock('@/lib/services/engine-failures', () => ({
  reportAutomationFailure: (...a: unknown[]) => reportAutomationFailure(...a),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.limit = () => chain
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        resolve(selectQueue.length ? selectQueue.shift() : [])
      return chain
    },
  },
  schema: new Proxy({}, { get: () => ({}) }),
}))

const runImport = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve())
vi.mock('@/lib/services/pms/sync', () => ({ runImport: (...a: unknown[]) => runImport(...a) }))
// The real error class — the cron tells an overlap apart from real breakage by
// TYPE, so a stub here would make the test agree with itself rather than with
// what runImport actually throws.
import { PmsSyncInFlightError } from '@/lib/services/pms/provider'
const sendNotificationEmail = vi.fn((..._a: unknown[]) => Promise.resolve())
vi.mock('@/lib/email', () => ({ sendNotificationEmail: (...a: unknown[]) => sendNotificationEmail(...a) }))
const notifyOrgMembers = vi.fn((..._a: unknown[]) => Promise.resolve())
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: (...a: unknown[]) => notifyOrgMembers(...a) }))

vi.mock('drizzle-orm', () => ({ and: () => ({}), eq: () => ({}), desc: (x: unknown) => x }))

import { POST } from '@/app/api/cron/pms-sync/route'

function req() {
  return new Request('https://x/api/cron/pms-sync', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  selectQueue.length = 0
  runImport.mockReset()
  notifyOrgMembers.mockReset()
  sendNotificationEmail.mockReset()
  reportAutomationFailure.mockReset()
  reportAutomationFailure.mockResolvedValue(true)
})

describe('cron pms-sync — budget-partial is not a failure', () => {
  it('does NOT alert when a run returns a resumable (budget-capped) partial', async () => {
    selectQueue.push([{ organizationId: 'org1', provider: 'open_dental' }]) // connections
    runImport.mockResolvedValue({
      runId: 'r1',
      status: 'partial',
      counts: {},
      error: null,
      partial: true,
      resumeAvailable: true,
      progress: { imported: 1200, total: 5000 },
    })

    const res = await POST(req())
    const body = await res.json()

    expect(notifyOrgMembers).not.toHaveBeenCalled()
    expect(sendNotificationEmail).not.toHaveBeenCalled()
    expect(body.resuming).toBe(1)
    expect(body.failed).toBe(0)
    expect(body.succeeded).toBe(0)
  })

  it('DOES alert on a real failure (error) at the start of a streak', async () => {
    selectQueue.push([{ organizationId: 'org1', provider: 'open_dental' }]) // connections
    runImport.mockResolvedValue({
      runId: 'r1',
      status: 'error',
      counts: {},
      error: 'eConnector unreachable',
      partial: false,
      resumeAvailable: false,
      progress: null,
    })
    // maybeAlertFailure → streak query: one failing run (streak start = 1 → alert).
    selectQueue.push([{ status: 'error' }])

    const res = await POST(req())
    const body = await res.json()

    expect(notifyOrgMembers).toHaveBeenCalledTimes(1)
    expect(body.failed).toBe(1)
    expect(body.resuming).toBe(0)
  })

  it('counts a successful run as succeeded (no alert)', async () => {
    selectQueue.push([{ organizationId: 'org1', provider: 'open_dental' }])
    runImport.mockResolvedValue({
      runId: 'r1',
      status: 'success',
      counts: {},
      error: null,
      partial: false,
      resumeAvailable: false,
      progress: null,
    })
    const res = await POST(req())
    const body = await res.json()
    expect(notifyOrgMembers).not.toHaveBeenCalled()
    expect(body.succeeded).toBe(1)
  })

  it('passes a per-org soft budget so one big office can’t starve the rest', async () => {
    selectQueue.push([{ organizationId: 'org1', provider: 'open_dental' }])
    runImport.mockResolvedValue({ runId: 'r', status: 'success', counts: {}, error: null, partial: false, resumeAvailable: false, progress: null })
    await POST(req())
    expect(runImport).toHaveBeenCalledTimes(1)
    const opts = runImport.mock.calls[0][1] as { softBudgetMs?: number; trigger?: string }
    expect(opts.trigger).toBe('scheduled')
    expect(typeof opts.softBudgetMs).toBe('number')
    expect(opts.softBudgetMs!).toBeGreaterThan(0)
  })
})

// ── DREAMCRM-57 ──────────────────────────────────────────────────────────────

describe('cron pms-sync — a pre-run throw reaches the Guardian unless it is an overlap', () => {
  it('a missing Customer Key reports the break, so the clinic stops reading `healthy`', async () => {
    selectQueue.push([{ organizationId: 'org1', provider: 'open_dental' }])
    // runImport throws BEFORE it can write a sync_run row, so the streak rule
    // — which counts sync_run rows — is structurally blind to this clinic. It
    // throws in the same place on every hourly tick, so the Guardian went on
    // calling a dead bridge healthy indefinitely.
    runImport.mockRejectedValue(new Error('No Open Dental Customer Key configured.'))

    const res = await POST(req())
    const body = await res.json()

    expect(reportAutomationFailure).toHaveBeenCalledTimes(1)
    expect(reportAutomationFailure).toHaveBeenCalledWith('org1', 'pms_sync')
    expect(body.failed).toBe(1)
    // The clinic-facing streak email still stays out of it — the streak rule
    // keys off sync_run rows and there is no run to count.
    expect(notifyOrgMembers).not.toHaveBeenCalled()
    expect(body.results[0].alerted).toBe(false)
  })

  it('an OVERLAP stays silent — another run is doing the work, nothing is broken', async () => {
    selectQueue.push([{ organizationId: 'org1', provider: 'open_dental' }])
    runImport.mockRejectedValue(
      new PmsSyncInFlightError('A sync is already running for this clinic — please wait for it to finish.'),
    )

    const res = await POST(req())
    const body = await res.json()

    expect(reportAutomationFailure).not.toHaveBeenCalled()
    expect(notifyOrgMembers).not.toHaveBeenCalled()
    expect(body.failed).toBe(1)
  })

  it("one clinic's pre-run throw does not stop the next clinic's sync", async () => {
    selectQueue.push([
      { organizationId: 'org_boom', provider: 'open_dental' },
      { organizationId: 'org_after', provider: 'open_dental' },
    ])
    runImport.mockRejectedValueOnce(new Error('No Open Dental Customer Key configured.'))
    runImport.mockResolvedValue({
      runId: 'r2',
      status: 'success',
      counts: {},
      error: null,
      partial: false,
      resumeAvailable: false,
      progress: null,
    })

    const body = await (await POST(req())).json()

    expect(body.failed).toBe(1)
    expect(body.succeeded).toBe(1)
    expect(reportAutomationFailure).toHaveBeenCalledWith('org_boom', 'pms_sync')
  })

  it('a Guardian write that itself fails never takes the loop down with it', async () => {
    selectQueue.push([
      { organizationId: 'org_boom', provider: 'open_dental' },
      { organizationId: 'org_after', provider: 'open_dental' },
    ])
    reportAutomationFailure.mockRejectedValue(new Error('ledger unreachable'))
    runImport.mockRejectedValueOnce(new Error('No Open Dental Customer Key configured.'))
    runImport.mockResolvedValue({
      runId: 'r2',
      status: 'success',
      counts: {},
      error: null,
      partial: false,
      resumeAvailable: false,
      progress: null,
    })

    const body = await (await POST(req())).json()

    expect(body.succeeded).toBe(1)
    expect(body.failed).toBe(1)
  })
})
