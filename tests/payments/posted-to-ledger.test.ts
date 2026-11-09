import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-43 — "To reconcile" means "not yet posted to the ledger".
 * The statements are rendered by the REAL drizzle pipeline over a recording
 * client (no database), so the org scope, the paid + not-posted predicate and
 * the who/when stamp are asserted on what Postgres would receive.
 */
const captured: Array<{ text: string; values?: unknown[] }> = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const client = {
    query: async (q: { text: string; values?: unknown[] } | string, params?: unknown[]) => {
      captured.push(typeof q === 'string' ? { text: q, values: params } : { text: q.text, values: q.values ?? params })
      return { rows: [] }
    },
  }
  return { schema, db: drizzle(client as never) }
})
vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))

import {
  countToReconcile,
  markPaymentsPosted,
  markPaymentPosted,
  unmarkPaymentPosted,
} from '@/lib/services/balance-payments'
import { toReconcileSub, toPostLabel } from '@/lib/payments-reconcile'

const last = () => captured[captured.length - 1]!

beforeEach(() => {
  captured.length = 0
})

describe('the to-reconcile predicate', () => {
  it('counts paid, not-yet-posted rows in ONE org', async () => {
    await countToReconcile('org_a')
    const { text, values } = last()
    expect(text).toContain('"organization_id" = $')
    expect(text).toContain('"status" = $')
    expect(text).toContain('"posted_at" is null')
    expect(values).toEqual(expect.arrayContaining(['org_a', 'paid']))
  })
})

describe('mark posted', () => {
  it('stamps who and when, only on paid + unposted rows of this org', async () => {
    const at = new Date('2026-11-09T15:00:00Z')
    await markPaymentsPosted('org_a', ['p1', 'p2', 'p1'], 'user_7', at)
    const { text, values } = last()
    expect(text).toMatch(/^update "patient_balance_payment" set "posted_at" = \$1, "posted_by_user_id" = \$2/)
    expect(text).toContain('"organization_id" = $')
    expect(text).toContain('"posted_at" is null')
    expect(text).toContain('"id" in ($')
    expect(values).toEqual(expect.arrayContaining([at.toISOString(), 'user_7', 'org_a', 'paid', 'p1', 'p2']))
    // the duplicate id is collapsed
    expect(values!.filter((v) => v === 'p1')).toHaveLength(1)
  })

  it('does nothing for an empty batch (no statement)', async () => {
    expect(await markPaymentsPosted('org_a', [], 'user_7')).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it('single mark goes through the same scoped statement', async () => {
    await markPaymentPosted('org_a', 'p1', 'user_7')
    expect(last().text).toContain('"posted_at" is null')
  })
})

describe('unmark posted', () => {
  it('clears the stamp, scoped by org + id, only where posted', async () => {
    await unmarkPaymentPosted('org_a', 'p1')
    const { text, values } = last()
    expect(text).toMatch(/set "posted_at" = \$1, "posted_by_user_id" = \$2/)
    expect(values!.slice(0, 2)).toEqual([null, null])
    expect(text).toContain('"organization_id" = $')
    expect(text).toContain('"posted_at" is not null')
    expect(values).toEqual(expect.arrayContaining(['org_a', 'p1']))
  })
})

describe('the copy', () => {
  it('says what the number means, in the anti-shame voice', () => {
    expect(toReconcileSub(3)).toBe('paid online, not yet in your ledger')
    expect(toReconcileSub(0)).toBe('all posted')
    expect(toPostLabel(3)).toBe('3 to post')
    expect(toPostLabel(0)).toBe('All posted')
    expect(toPostLabel(3)).not.toMatch(/reconcil|pending|unposted/i)
  })

  it('never claims a PMS posts payments automatically (the sync does not)', () => {
    const files = [
      'lib/payments-reconcile.ts',
      'app/(default)/payments/page.tsx',
      'app/(default)/payments/online/page.tsx',
      'app/(default)/payments/online/posting-table.tsx',
    ]
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toMatch(/posted to [^.\n]*automatically/i)
      expect(src, f).not.toMatch(/to post to your PMS/i)
    }
    // And the sync really does not post payments.
    const nex = readFileSync(join(process.cwd(), 'lib/services/pms/nexhealth.ts'), 'utf8')
    expect(nex).not.toMatch(/patient_balance_payment|patientBalancePayment|postedAt/)
  })

  it('the hub KPI reads the posted-aware count, not the capped list', () => {
    const src = readFileSync(join(process.cwd(), 'app/(default)/payments/page.tsx'), 'utf8')
    expect(src).toContain('countToReconcile(')
    expect(src).not.toContain('listRecentBalancePayments')
  })
})
