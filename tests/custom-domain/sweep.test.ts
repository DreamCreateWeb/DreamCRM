import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE CUSTOM-DOMAIN SWEEP (2026-10-26). Until it existed, nothing advanced a
 * pending domain unless a browser tab was open — the managed-cert ATTACH and
 * the activation nudge live inside `checkCustomDomainStatus`, and the only
 * drivers were the Domain page's 45s poll, Check now and the operator
 * redrive. Pinned here:
 *
 *  - only PENDING rows, on clinic orgs, never the demo (asked of the real
 *    rendered SQL, not the mock), never a shut-down clinic;
 *  - oldest `lastCheckedAt` first, never-checked at the front, at most
 *    `CUSTOM_DOMAIN_SWEEP_MAX` per tick, paced, inside a budget;
 *  - one tenant's throw never stops the rest and is reported to the Guardian;
 *  - `lastSweptAt` is stamped in the SAME status jsonb, idempotently;
 *  - a domain still pending a day after Connect pages the platform ONCE;
 *  - the flip to active writes ONE ledger line, whoever asked.
 */

const h = vi.hoisted(() => ({
  /** Rows the sweep's join read returns (the mock's `where` resolves to this). */
  rows: [] as Array<Record<string, unknown>>,
  /** The one profile the REAL check path reads back (`getStatus`). */
  profile: null as Record<string, unknown> | null,
  /** Every `update().set(payload)` the service wrote, in order. */
  updates: [] as Array<Record<string, unknown>>,
  /** Every `where(...)` condition handed to a read, rendered by the tests. */
  whereArgs: [] as unknown[],
  shutDown: new Set<string>(),
  platformOrgId: 'org_platform' as string | null,
  notify: vi.fn(async (..._a: unknown[]) => {}),
  reportFailure: vi.fn(async (..._a: unknown[]) => true),
  recordAction: vi.fn(async (..._a: unknown[]) => true),
  describe: vi.fn(async (_input: unknown): Promise<unknown> => ({})),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.innerJoin = () => chain
      chain.where = (cond: unknown) => {
        h.whereArgs.push(cond)
        // Awaiting `.where(...)` is the sweep's join read; `.limit(1)` is the
        // single-profile read the real check path does (`getStatus`).
        const p = Promise.resolve(h.rows) as Promise<unknown> & { limit: () => Promise<unknown[]> }
        p.limit = async () => (h.profile ? [h.profile] : [])
        return p
      }
      return chain
    },
    update: () => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => {
          h.updates.push(payload)
          // Keep the in-memory profile in step so a follow-up read sees it.
          if (h.profile) h.profile = { ...h.profile, ...payload }
        },
      }),
    }),
  },
}))
vi.mock('@/lib/services/billing-state', () => ({
  listShutDownOrgIds: vi.fn(async () => h.shutDown),
}))
vi.mock('@/lib/services/engine-failures', () => ({
  reportAutomationFailure: h.reportFailure,
}))
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: h.recordAction,
}))
vi.mock('@/lib/services/notifications', () => ({
  notifyOrgMembers: h.notify,
}))
vi.mock('@/lib/services/gsc', () => ({
  getPlatformOrgId: vi.fn(async () => h.platformOrgId),
}))
vi.mock('@aws-sdk/client-apprunner', () => ({
  AppRunnerClient: class {
    send(cmd: { __type: string; input: unknown }) {
      if (cmd.__type === 'describe') return h.describe(cmd.input)
      throw new Error('unknown command')
    }
  },
  DescribeCustomDomainsCommand: class {
    __type = 'describe'
    constructor(public input: unknown) {}
  },
}))

import {
  sweepPendingCustomDomains,
  checkCustomDomainStatus,
  orderPendingForSweep,
  stillPendingAlertDue,
  CUSTOM_DOMAIN_SWEEP_MAX,
  CUSTOM_DOMAIN_SWEEP_PACING_MS,
  CUSTOM_DOMAIN_STILL_PENDING_AFTER_MS,
  type CustomDomainStatus,
  type CustomDomainResult,
} from '@/lib/services/custom-domain'

const NOW = new Date('2026-10-26T15:00:00.000Z')
const HOUR = 60 * 60 * 1000
const noSleep = async () => {}

function pending(over: Partial<CustomDomainStatus> & { domain: string }): CustomDomainStatus {
  return {
    state: 'pending_dns',
    requestedAt: new Date(NOW.getTime() - HOUR).toISOString(),
    dnsRecords: [],
    driver: 'cloudfront',
    ...over,
  }
}

function row(organizationId: string, status: CustomDomainStatus) {
  return { organizationId, clinicName: `Clinic ${organizationId}`, customDomainStatus: status }
}

/** An injected check that answers "still exactly what you stored, freshly
 *  checked" — the sweep's orchestration under test, the edge out of it. */
const stillPending = vi.fn(async (orgId: string): Promise<CustomDomainResult> => {
  const r = h.rows.find((x) => x.organizationId === orgId)
  if (!r) return { ok: false, error: 'No custom domain is set up.' }
  return {
    ok: true,
    status: { ...(r.customDomainStatus as CustomDomainStatus), lastCheckedAt: NOW.toISOString() },
  }
})

/** The status the sweep persisted for a domain, from the captured updates. */
function persistedFor(domain: string): CustomDomainStatus[] {
  return h.updates
    .map((u) => u.customDomainStatus as CustomDomainStatus | null)
    .filter((s): s is CustomDomainStatus => !!s && s.domain === domain)
}

beforeEach(() => {
  h.rows = []
  h.profile = null
  h.updates = []
  h.whereArgs = []
  h.shutDown = new Set()
  h.platformOrgId = 'org_platform'
  h.notify.mockClear().mockResolvedValue(undefined)
  h.reportFailure.mockClear()
  h.recordAction.mockClear()
  h.describe.mockReset()
  stillPending.mockClear()
  process.env.APP_RUNNER_SERVICE_ARN = 'arn:aws:apprunner:us-east-1:1:service/dreamcrm/abc'
  delete process.env.CUSTOM_DOMAIN_DRIVER
})

describe('who the sweep asks about', () => {
  it('asks the REAL query for pending rows on clinic orgs that are not the demo', async () => {
    h.rows = [row('org_a', pending({ domain: 'www.a.com' }))]
    await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    // Rendered through drizzle's own dialect, not read off the mock: the
    // filter is the law, and a JS-side re-filter would hide a wrong WHERE.
    const { sql, params } = new PgDialect().sqlToQuery(h.whereArgs[0] as never)
    expect(sql).toContain(`"clinic_profile"."custom_domain_status" ->> 'state' = 'pending_dns'`)
    expect(sql).toMatch(/"organization"\."type" = \$\d/)
    expect(sql).toMatch(/"organization"\."is_demo" = \$\d/)
    expect(params).toContain('clinic')
    expect(params).toContain(false)
  })

  it('touches only PENDING rows even when the read hands it others', async () => {
    h.rows = [
      row('org_a', pending({ domain: 'www.a.com' })),
      row('org_b', { ...pending({ domain: 'www.b.com' }), state: 'active' }),
      row('org_c', { ...pending({ domain: 'www.c.com' }), state: 'failed' }),
      row('org_d', pending({ domain: 'www.d.com', requestedAt: new Date(NOW.getTime() - 2 * HOUR).toISOString() })),
    ]
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    // org_d asked first: never checked, and asked for earlier than org_a.
    expect(stillPending.mock.calls.map((c) => c[0])).toEqual(['org_d', 'org_a'])
    expect(res).toMatchObject({ pending: 2, checked: 2, activated: 0, notified: 0, errors: [], completed: true })
    expect(persistedFor('www.b.com')).toEqual([])
    expect(persistedFor('www.c.com')).toEqual([])
  })

  it('leaves a shut-down clinic’s domain exactly where it is', async () => {
    h.rows = [row('org_a', pending({ domain: 'www.a.com' })), row('org_b', pending({ domain: 'www.b.com' }))]
    h.shutDown = new Set(['org_b'])
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    expect(stillPending.mock.calls.map((c) => c[0])).toEqual(['org_a'])
    expect(res).toMatchObject({ pending: 1, shutDown: 1, checked: 1 })
    expect(persistedFor('www.b.com')).toEqual([])
  })

  it('does nothing at all on a quiet platform', async () => {
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    expect(res).toEqual({ pending: 0, checked: 0, activated: 0, notified: 0, shutDown: 0, errors: [], completed: true })
    expect(h.updates).toEqual([])
  })
})

describe('order, cap, pacing and budget', () => {
  it('walks oldest-checked first with never-checked rows at the front', () => {
    const rows = [
      { id: 'checked-recently', status: { lastCheckedAt: '2026-10-26T14:00:00.000Z', requestedAt: '2026-10-01T00:00:00.000Z' } },
      { id: 'never-checked-late', status: { requestedAt: '2026-10-20T00:00:00.000Z' } },
      { id: 'checked-long-ago', status: { lastCheckedAt: '2026-10-10T00:00:00.000Z', requestedAt: '2026-10-01T00:00:00.000Z' } },
      { id: 'never-checked-early', status: { requestedAt: '2026-10-02T00:00:00.000Z' } },
      { id: 'garbage-stamp', status: { lastCheckedAt: 'not a date', requestedAt: '2026-10-03T00:00:00.000Z' } },
    ]
    // An unparseable stamp counts as never checked (nobody can say when), so
    // the three never-checked rows sort among themselves by requestedAt.
    expect(orderPendingForSweep(rows).map((r) => r.id)).toEqual([
      'never-checked-early',
      'garbage-stamp',
      'never-checked-late',
      'checked-long-ago',
      'checked-recently',
    ])
  })

  it('asks about at most MAX per tick and says the pass is not complete', async () => {
    expect(CUSTOM_DOMAIN_SWEEP_MAX).toBe(50)
    h.rows = ['org_a', 'org_b', 'org_c'].map((id, i) =>
      row(id, pending({ domain: `www.${id}.com`, lastCheckedAt: new Date(NOW.getTime() - (3 - i) * HOUR).toISOString() })),
    )
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending, max: 2 })
    // The two checked LONGEST ago; the third waits for the next tick — and
    // these two now carry a fresh stamp, so it is first next time.
    expect(stillPending.mock.calls.map((c) => c[0])).toEqual(['org_a', 'org_b'])
    expect(res).toMatchObject({ pending: 3, checked: 2, completed: false })
  })

  it('paces BETWEEN rows, never before the first', async () => {
    expect(CUSTOM_DOMAIN_SWEEP_PACING_MS).toBe(2_000)
    h.rows = ['org_a', 'org_b', 'org_c'].map((id) => row(id, pending({ domain: `www.${id}.com` })))
    const sleep = vi.fn(async (_ms: number) => {})
    await sweepPendingCustomDomains({ now: NOW, sleep, check: stillPending })
    expect(sleep.mock.calls).toEqual([[2_000], [2_000]])
  })

  it('stops starting rows once the budget is spent, and says so', async () => {
    h.rows = ['org_a', 'org_b', 'org_c'].map((id) => row(id, pending({ domain: `www.${id}.com` })))
    let t = 1_000
    const clock = () => t
    const check = vi.fn(async (orgId: string) => {
      t += 500_000 // one row's work (a slow edge) blew the budget
      return stillPending(orgId)
    })
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check, clock, budgetMs: 240_000 })
    // The first row ALWAYS runs (a spent-on-arrival budget must still make
    // progress); the budget is checked before the second starts.
    expect(check.mock.calls.map((c) => c[0])).toEqual(['org_a'])
    expect(res).toMatchObject({ checked: 1, completed: false })
  })
})

describe('per-row isolation', () => {
  it('one tenant’s throw never stops the rest, and is reported to the Guardian', async () => {
    h.rows = ['org_a', 'org_b', 'org_c'].map((id) => row(id, pending({ domain: `www.${id}.com` })))
    const check = vi.fn(async (orgId: string) => {
      if (orgId === 'org_b') throw new Error('ExpiredTokenException: The security token included in the request is expired')
      return stillPending(orgId)
    })
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check })
    expect(check.mock.calls.map((c) => c[0])).toEqual(['org_a', 'org_b', 'org_c'])
    expect(res).toMatchObject({ pending: 3, checked: 2, errors: ['org_b'], completed: true })
    expect(persistedFor('www.org_a.com')).toHaveLength(1)
    expect(persistedFor('www.org_c.com')).toHaveLength(1)
    expect(persistedFor('www.org_b.com')).toEqual([])
    // Under the clinic's own ledger, one strike per day — the registry's law.
    expect(h.reportFailure).toHaveBeenCalledTimes(1)
    expect(h.reportFailure).toHaveBeenCalledWith('org_b', 'custom_domain', NOW)
  })

  it('a row removed between the read and the check is simply skipped', async () => {
    h.rows = [row('org_a', pending({ domain: 'www.a.com' }))]
    const check = vi.fn(async (): Promise<CustomDomainResult> => ({ ok: false, error: 'No custom domain is set up.' }))
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check })
    expect(res).toMatchObject({ pending: 1, checked: 0, errors: [] })
    expect(h.updates).toEqual([])
  })
})

describe('the stamps live in the same status jsonb', () => {
  it('stamps lastSweptAt beside what the check wrote, and nothing else changes', async () => {
    const status = pending({ domain: 'www.a.com', associateHost: 'a.com', servedHosts: ['a.com', 'www.a.com'] })
    h.rows = [row('org_a', status)]
    await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    const [written] = persistedFor('www.a.com')
    expect(written).toEqual({ ...status, lastCheckedAt: NOW.toISOString(), lastSweptAt: NOW.toISOString() })
    // `persist` keeps websiteDomain in step with the canonical host.
    expect(h.updates[0].websiteDomain).toBe('www.a.com')
  })

  it('is idempotent — a second tick re-stamps the same value and alerts nobody', async () => {
    h.rows = [row('org_a', pending({ domain: 'www.a.com' }))]
    await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    const writes = persistedFor('www.a.com')
    expect(writes).toHaveLength(2)
    expect(writes[0]).toEqual(writes[1])
    expect(h.notify).not.toHaveBeenCalled()
    expect(h.recordAction).not.toHaveBeenCalled()
  })
})

describe('a domain still pending a day after Connect', () => {
  const dayOld = () => pending({ domain: 'www.slow.com', requestedAt: new Date(NOW.getTime() - 25 * HOUR).toISOString() })

  it('pages the platform ONCE on the existing domain_attach_manual key, and stamps notifiedAt', async () => {
    h.rows = [row('org_a', dayOld())]
    const first = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    expect(first.notified).toBe(1)
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.notify).toHaveBeenCalledWith(
      'org_platform',
      expect.objectContaining({
        type: 'domain_attach_manual',
        forceEmail: true,
        title: expect.stringContaining('www.slow.com'),
        body: expect.stringContaining('Clinic org_a'),
        linkPath: '/ecommerce/customers/org_a',
        dedupeKey: `domain_pending:org_a:${dayOld().requestedAt}`,
      }),
      { roles: ['owner', 'admin'] },
    )
    const [written] = persistedFor('www.slow.com')
    expect(written.notifiedAt).toBe(NOW.toISOString())

    // The next tick reads the stamped row back — nobody is told twice.
    h.rows = [row('org_a', written)]
    const second = await sweepPendingCustomDomains({ now: new Date(NOW.getTime() + HOUR), sleep: noSleep, check: stillPending })
    expect(second.notified).toBe(0)
    expect(h.notify).toHaveBeenCalledTimes(1)
  })

  it('says it is the MANUAL state when it is — the operator owes them, not their DNS', async () => {
    h.rows = [row('org_a', { ...dayOld(), error: 'manual' })]
    await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    const input = h.notify.mock.calls[0][1] as { body: string }
    expect(input.body).toMatch(/operator/)
    expect(input.body).not.toMatch(/records haven’t landed/)
  })

  it('tells nobody under 24 hours', async () => {
    h.rows = [row('org_a', pending({ domain: 'www.fresh.com', requestedAt: new Date(NOW.getTime() - 23 * HOUR).toISOString() }))]
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    expect(res.notified).toBe(0)
    expect(h.notify).not.toHaveBeenCalled()
    expect(persistedFor('www.fresh.com')[0].notifiedAt).toBeUndefined()
  })

  it('does NOT stamp when the alert itself fails, so the next tick tries again', async () => {
    h.rows = [row('org_a', dayOld())]
    h.notify.mockRejectedValueOnce(new Error('mail down'))
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check: stillPending })
    expect(res).toMatchObject({ notified: 0, checked: 1, errors: [] })
    const [written] = persistedFor('www.slow.com')
    expect(written.notifiedAt).toBeUndefined()
    expect(written.lastSweptAt).toBe(NOW.toISOString())
  })

  it('the pure rule: measured from Connect, never from the last check', () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
    expect(stillPendingAlertDue(pending({ domain: 'x', requestedAt: at(CUSTOM_DOMAIN_STILL_PENDING_AFTER_MS) }), NOW)).toBe(true)
    expect(stillPendingAlertDue(pending({ domain: 'x', requestedAt: at(CUSTOM_DOMAIN_STILL_PENDING_AFTER_MS - 1) }), NOW)).toBe(false)
    // A row nobody looked at for a week is exactly the row this is for.
    expect(
      stillPendingAlertDue(pending({ domain: 'x', requestedAt: at(7 * 24 * HOUR), lastCheckedAt: at(0) }), NOW),
    ).toBe(true)
    expect(stillPendingAlertDue({ ...pending({ domain: 'x', requestedAt: at(48 * HOUR) }), notifiedAt: at(HOUR) }, NOW)).toBe(false)
    expect(stillPendingAlertDue({ ...pending({ domain: 'x', requestedAt: at(48 * HOUR) }), state: 'active' }, NOW)).toBe(false)
    expect(stillPendingAlertDue(pending({ domain: 'x', requestedAt: 'not a date' }), NOW)).toBe(false)
  })
})

describe('the flip to active', () => {
  it('counts it; the ledger line is the check’s to write, not the sweep’s', async () => {
    h.rows = [row('org_a', pending({ domain: 'www.a.com' }))]
    const check = vi.fn(async (): Promise<CustomDomainResult> => ({
      ok: true,
      status: { ...pending({ domain: 'www.a.com' }), state: 'active', lastCheckedAt: NOW.toISOString() },
    }))
    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep, check })
    expect(res.activated).toBe(1)
    expect(persistedFor('www.a.com')[0]).toMatchObject({ state: 'active', lastSweptAt: NOW.toISOString() })
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('through the DEFAULT check, writes ONE ledger line whoever asked — and never again', async () => {
    const status: CustomDomainStatus = {
      state: 'pending_dns',
      domain: 'www.a.com',
      associateHost: 'a.com',
      servedHosts: ['a.com', 'www.a.com'],
      requestedAt: new Date(NOW.getTime() - HOUR).toISOString(),
      dnsRecords: [],
    }
    h.profile = { organizationId: 'org_a', websiteDomain: 'www.a.com', customDomainStatus: status }
    h.rows = [row('org_a', status)]
    h.describe.mockResolvedValue({
      DNSTarget: 'x.awsapprunner.com',
      CustomDomains: [{ DomainName: 'a.com', Status: 'active', CertificateValidationRecords: [] }],
    })

    const res = await sweepPendingCustomDomains({ now: NOW, sleep: noSleep })
    expect(res).toMatchObject({ checked: 1, activated: 1, errors: [] })
    expect(h.recordAction).toHaveBeenCalledTimes(1)
    expect(h.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_a',
        capability: 'custom_domain',
        summary: 'Connected www.a.com — your website is live there now.',
        detail: expect.objectContaining({ domain: 'www.a.com', servedHosts: ['a.com', 'www.a.com'] }),
      }),
    )
    const written = persistedFor('www.a.com')
    expect(written[written.length - 1]).toMatchObject({ state: 'active', lastSweptAt: NOW.toISOString() })

    // The card's next poll reads an already-active row: nothing to announce.
    const again = await checkCustomDomainStatus('org_a')
    expect(again.ok && again.status.state).toBe('active')
    expect(h.recordAction).toHaveBeenCalledTimes(1)
  })
})
