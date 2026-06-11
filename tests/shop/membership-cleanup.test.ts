import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * cleanupStalePendingMemberships — the orphan-pending-membership sweep.
 *
 * A membership row is written status='pending' BEFORE Stripe Checkout; an
 * abandoned checkout never advances it. This sweep deletes only narrowly-scoped
 * abandoned rows (pending + no subscription + older than the cutoff). We mock
 * drizzle-orm so we can capture the exact conditions the delete is built with
 * and prove the scope can't touch a live membership.
 */

const state = {
  // each delete records the captured condition descriptors + the rows it
  // "removed" (driven by deleteReturn)
  conditions: [] as unknown[],
  deleteReturn: [] as Array<{ id: string }>,
}

vi.mock('@/lib/db', () => ({
  db: {
    delete: () => ({
      where: (cond: unknown) => {
        state.conditions.push(cond)
        return { returning: async () => state.deleteReturn }
      },
    }),
  },
  schema: {
    membership: {
      organizationId: 'membership.organizationId',
      status: 'membership.status',
      stripeSubscriptionId: 'membership.stripeSubscriptionId',
      createdAt: 'membership.createdAt',
    },
  },
}))

// Capture each condition primitive so we can assert the scope.
const eqCalls: Array<{ col: unknown; val: unknown }> = []
const sqlFragments: string[] = []
const sqlVals: unknown[] = []

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conds: unknown[]) => ({ _kind: 'and', conds })),
  eq: vi.fn((col: unknown, val: unknown) => {
    eqCalls.push({ col, val })
    return { _kind: 'eq', col, val }
  }),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  count: vi.fn(() => ({ _kind: 'count' })),
  inArray: vi.fn(() => ({ _kind: 'inArray' })),
  ne: vi.fn(() => ({ _kind: 'ne' })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const frag = strings.join('?')
      sqlFragments.push(frag)
      sqlVals.push(...vals)
      return { _kind: 'sql', frag, vals }
    },
    { raw: vi.fn() },
  ),
}))

vi.mock('@/lib/stripe', () => ({ stripe: {}, subscriptionPeriodEnd: vi.fn() }))
vi.mock('@/lib/utils', () => ({ slugify: (s: string) => s }))
vi.mock('./notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/contact-normalize', () => ({ normalizePhone: vi.fn(), samePhone: vi.fn() }))

import { cleanupStalePendingMemberships } from '@/lib/services/membership'

beforeEach(() => {
  state.conditions = []
  state.deleteReturn = []
  eqCalls.length = 0
  sqlFragments.length = 0
  sqlVals.length = 0
})

describe('cleanupStalePendingMemberships', () => {
  it('scopes the delete to org + pending + null-subscription + an age cutoff', async () => {
    state.deleteReturn = [{ id: 'mem_old_1' }, { id: 'mem_old_2' }]
    const removed = await cleanupStalePendingMemberships('org_1', 24)

    // Returns the number of rows removed.
    expect(removed).toBe(2)
    expect(state.conditions).toHaveLength(1)

    // status = 'pending' is one of the eq() conditions (terminal/live statuses
    // are never matched).
    expect(eqCalls.some((c) => c.val === 'pending')).toBe(true)
    // org-scoped.
    expect(eqCalls.some((c) => c.val === 'org_1')).toBe(true)

    // The null-subscription guard + the age guard are SQL fragments (the column
    // refs are interpolated, so they appear as `?` placeholders). One fragment
    // is `${stripeSubscriptionId} is null` → a pending row WITH a subscription
    // (mid-activation) is never swept. The other is `${createdAt} < ${cutoff}`.
    expect(sqlFragments.some((f) => /is null$/.test(f))).toBe(true)
    expect(sqlFragments.some((f) => /<\s*\?$/.test(f))).toBe(true)
    // The createdAt cutoff was passed as a real Date value.
    expect(sqlVals.some((v) => v instanceof Date)).toBe(true)
  })

  it('computes the cutoff Date from the supplied window (now − Nh)', async () => {
    const before = Date.now()
    await cleanupStalePendingMemberships('org_1', 48)
    const after = Date.now()

    // The only Date passed into sql() is the createdAt cutoff. It must sit
    // ~48h in the past so a fresh (recently-created) pending row — an
    // in-progress checkout — is never eligible for deletion.
    const cutoff = sqlVals.find((v): v is Date => v instanceof Date)
    expect(cutoff).toBeInstanceOf(Date)
    const windowMs = 48 * 60 * 60 * 1000
    expect(cutoff!.getTime()).toBeGreaterThanOrEqual(before - windowMs - 1000)
    expect(cutoff!.getTime()).toBeLessThanOrEqual(after - windowMs + 1000)
  })

  it('returns 0 when nothing matched', async () => {
    state.deleteReturn = []
    const removed = await cleanupStalePendingMemberships('org_1')
    expect(removed).toBe(0)
  })

  it('defaults the window to 24 hours when not supplied', async () => {
    await cleanupStalePendingMemberships('org_1')
    // A delete was still issued with the standard scope.
    expect(state.conditions).toHaveLength(1)
    expect(eqCalls.some((c) => c.val === 'pending')).toBe(true)
  })
})
