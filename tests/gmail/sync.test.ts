import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * ML-59 — the Gmail inbox opens instantly; syncing happens behind it.
 * Pure rules + the sweep (wanted-first, walled skipped, a failure is one
 * strike and never stops the walk, backfills are best-effort, the budget
 * parks the cursor) + the cron and webhook wiring.
 */
const h = vi.hoisted(() => ({
  rows: [] as any[],
  walled: new Set<string>(),
  syncCalls: [] as string[],
  failFor: new Set<string>(),
  strikes: [] as Array<[string, string]>,
  backfillFails: false,
  cursorWrites: [] as any[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => h.rows }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
  schema: new Proxy({}, { get: () => new Proxy({}, { get: (_t, k) => String(k) }) }),
}))
vi.mock('drizzle-orm', () => ({ and: () => 0, eq: () => 0, isNull: () => 0, lt: () => 0, or: () => 0 }))
vi.mock('@/lib/services/billing-state', () => ({ listShutDownOrgIds: async () => h.walled }))
vi.mock('@/lib/services/engine-failures', () => ({
  reportAutomationFailure: async (org: string, key: string) => {
    h.strikes.push([org, key])
  },
}))
vi.mock('@/lib/services/platform-config', () => ({
  readPlatformConfig: async () => ({}),
  writePlatformConfig: async (c: any) => {
    h.cursorWrites.push(c)
  },
}))
vi.mock('@/lib/services/mailbox', () => ({
  syncAccount: async (id: string) => {
    h.syncCalls.push(id)
    if (h.failFor.has(id)) throw new Error('gmail down')
    return { added: 1 }
  },
  classifyPendingIntents: async () => {
    if (h.backfillFails) throw new Error('x')
  },
  resolvePendingInlineImages: async () => {
    if (h.backfillFails) throw new Error('x')
  },
  backfillRfcMessageIds: async () => {
    if (h.backfillFails) throw new Error('x')
  },
}))

const NOW = new Date('2026-11-09T15:00:00Z')
const row = (id: string, org: string, over: Record<string, unknown> = {}) => ({
  id,
  organizationId: org,
  syncStatus: 'ready',
  lastSyncAt: new Date(NOW.getTime() - 10 * 60_000),
  wantedAt: null,
  updatedAt: new Date(NOW.getTime() - 10 * 60_000),
  ...over,
})

beforeEach(() => {
  h.rows = []
  h.walled = new Set()
  h.syncCalls = []
  h.failFor = new Set()
  h.strikes = []
  h.backfillFails = false
  h.cursorWrites = []
})

describe('pure rules', () => {
  it('rate-aware: a fresh sync or a live syncing run is skipped; a stuck one is not', async () => {
    const { shouldSyncMailbox } = await import('@/lib/services/gmail-sync')
    expect(shouldSyncMailbox(row('a', 'o', { lastSyncAt: new Date(NOW.getTime() - 30_000) }) as any, NOW)).toBe(false)
    expect(
      shouldSyncMailbox(row('a', 'o', { syncStatus: 'syncing', updatedAt: new Date(NOW.getTime() - 60_000) }) as any, NOW),
    ).toBe(false)
    expect(
      shouldSyncMailbox(row('a', 'o', { syncStatus: 'syncing', updatedAt: new Date(NOW.getTime() - 3_600_000) }) as any, NOW),
    ).toBe(true)
    expect(shouldSyncMailbox(row('a', 'o', { lastSyncAt: null }) as any, NOW)).toBe(true)
  })
})

describe('syncMailboxes', () => {
  it('serves wanted mailboxes first, skips walled clinics, and runs the backfills', async () => {
    h.rows = [row('a', 'o1'), row('b', 'o2', { wantedAt: new Date(NOW.getTime() - 60_000) }), row('c', 'walled')]
    h.walled = new Set(['walled'])
    const { syncMailboxes } = await import('@/lib/services/gmail-sync')
    const r = await syncMailboxes({ now: NOW })
    expect(h.syncCalls).toEqual(['b', 'a'])
    expect(r.wantedFirst).toBe(1)
    expect(r.walledSkipped).toBe(1)
    expect(r.backfills.classify).toBe(2)
    expect(r.completed).toBe(true)
  })

  it('one failing mailbox is one strike under inbox_sync and never stops the walk', async () => {
    h.rows = [row('a', 'o1'), row('b', 'o2')]
    h.failFor = new Set(['a'])
    const { syncMailboxes } = await import('@/lib/services/gmail-sync')
    const r = await syncMailboxes({ now: NOW })
    expect([...h.syncCalls].sort()).toEqual(['a', 'b'])
    expect(r.failed).toBe(1)
    expect(h.strikes).toEqual([['o1', 'inbox_sync']])
  })

  it('backfills are best-effort: a throwing backfill never fails the run', async () => {
    h.rows = [row('a', 'o1')]
    h.backfillFails = true
    const { syncMailboxes } = await import('@/lib/services/gmail-sync')
    const r = await syncMailboxes({ now: NOW })
    expect(r.synced).toBe(1)
    expect(r.backfills.failed).toBe(3)
  })

  it('a spent budget parks the cursor and reports an unfinished pass', async () => {
    h.rows = [row('a', 'o1'), row('b', 'o2'), row('c', 'o3')]
    const { syncMailboxes } = await import('@/lib/services/gmail-sync')
    const r = await syncMailboxes({ now: NOW, budget: 0 })
    expect(h.syncCalls).toEqual(['a'])
    expect(r.completed).toBe(false)
    expect(r.remaining).toBe(2)
    expect(h.cursorWrites[0]).toEqual({ 'cronCursor:gmail-sync': 'a' })
  })
})

describe('wiring', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  it('the cron route is CRON_SECRET-gated and calls the sweep', () => {
    const src = read('app/api/cron/gmail-sync/route.ts')
    expect(src).toContain('requireCronAuth')
    expect(src).toContain('syncMailboxes')
  })
  it('the schedule carries a 5-minute JOBS line', () => {
    expect(read('scripts/setup-cron-schedules.sh')).toMatch(/"gmail-sync\|gmail-sync\|rate\(5 minutes\)"/)
  })
  it('the push webhook still syncs THAT mailbox now', () => {
    expect(read('app/api/webhooks/gmail/route.ts')).toContain('processHistoryEvent')
  })
})
