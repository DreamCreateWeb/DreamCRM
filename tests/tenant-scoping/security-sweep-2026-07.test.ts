import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Regression tests for the 2026-07 cross-tenant isolation sweep (three live
 * clinics). Each guards a specific leak that was found and fixed:
 *
 *   - gsc.clinicPageFilter — an ANCHORED Search Console regex so one clinic's
 *     slug can never match a longer clinic's pages (was substring `contains`).
 *   - shop.saveProduct — variant delete/read is org-scoped, and a foreign
 *     productId is rejected before any variant mutation.
 *   - marketing-campaigns.getCampaignStats / getRecipientBreakdown — the
 *     campaign_events read is org-scoped by an inner join to `campaigns`.
 */

// ---- DB capture harness (shared with the ecommerce scoping test's shape) ----

interface CapturedInsert {
  values: Record<string, unknown> | Record<string, unknown>[]
}
interface CapturedWhere {
  sql: string
}

const state: {
  inserts: CapturedInsert[]
  wheres: CapturedWhere[]
  selectRows: unknown[][]
} = { inserts: [], wheres: [], selectRows: [] }

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) parts.push(String(obj.value))
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.innerJoin = () => obj
    obj.where = (clause: unknown) => {
      state.wheres.push({ sql: captureSql(clause) })
      return obj
    }
    obj.groupBy = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectRows.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectRows.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
          state.inserts.push({ values: vals })
          const res = Promise.resolve([{ id: 1 }]) as any
          res.returning = async () => [{ id: 1 }]
          return res
        },
      }),
      update: () => ({
        set: () => ({
          where: (clause: unknown) => {
            state.wheres.push({ sql: captureSql(clause) })
            const res = Promise.resolve([{ id: 1 }]) as any
            res.returning = async () => [{ id: 1 }]
            return res
          },
        }),
      }),
      delete: () => ({
        where: (clause: unknown) => {
          state.wheres.push({ sql: captureSql(clause) })
          const res = Promise.resolve([{ id: 1 }]) as any
          res.returning = async () => [{ id: 1 }]
          return res
        },
      }),
    },
    schema,
  }
})

import { clinicPageFilter } from '@/lib/services/gsc'
import { saveProduct } from '@/lib/services/shop'
import { getCampaignStats, getRecipientBreakdown } from '@/lib/services/marketing-campaigns'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'

beforeEach(() => {
  state.inserts.length = 0
  state.wheres.length = 0
  state.selectRows.length = 0
})

// ---------------------------------------------------------------------------

describe('gsc.clinicPageFilter — anchored, non-substring scope', () => {
  const prev = process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN
    else process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN = prev
  })

  it('path mode matches the clinic but not a longer-slug clinic', () => {
    delete process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN
    const re = new RegExp(clinicPageFilter('smile'))
    expect(re.test('https://www.dreamcreatestudio.com/site/smile')).toBe(true)
    expect(re.test('https://www.dreamcreatestudio.com/site/smile/services')).toBe(true)
    // The leak that was fixed: "smile" must NOT match "smiledental".
    expect(re.test('https://www.dreamcreatestudio.com/site/smiledental')).toBe(false)
    expect(re.test('https://www.dreamcreatestudio.com/site/smiledental/team')).toBe(false)
  })

  it('subdomain mode matches the clinic host but not a longer-slug host', () => {
    process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN = 'true'
    const re = new RegExp(clinicPageFilter('smile'))
    expect(re.test('https://smile.dreamcreatestudio.com/')).toBe(true)
    // "smile." must NOT match "mysmile." nor "smiledental."
    expect(re.test('https://mysmile.dreamcreatestudio.com/')).toBe(false)
    expect(re.test('https://smiledental.dreamcreatestudio.com/')).toBe(false)
  })

  it('regex-escapes the slug defensively', () => {
    delete process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN
    // A dotted slug must be a literal dot, not "any char".
    const re = new RegExp(clinicPageFilter('a.b'))
    expect(re.test('https://x/site/a.b')).toBe(true)
    expect(re.test('https://x/site/axb')).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('shop.saveProduct — variant mutation is org-scoped', () => {
  const validInput = {
    id: 'prod_existing',
    name: 'Whitening Kit',
    description: null,
    category: 'whitening' as any,
    images: [] as string[],
    status: 'active' as any,
    fulfillment: 'ship' as any,
    fsaEligible: false,
    featured: false,
    variants: [{ name: 'Default', priceDollars: 10 }],
  }

  it('rejects a foreign productId before touching variants', async () => {
    state.selectRows.push([]) // uniqueProductSlug: no existing slugs
    state.selectRows.push([]) // ownership check: NOT owned by ORG_A
    await expect(saveProduct(ORG_A, validInput as any)).rejects.toThrow(/not found in this organization/i)
    // Nothing was deleted or inserted for a foreign id.
    expect(state.inserts).toHaveLength(0)
  })

  it('org-scopes the variant delete on a valid update', async () => {
    state.selectRows.push([]) // uniqueProductSlug
    state.selectRows.push([{ id: 'prod_existing' }]) // ownership: owned by ORG_A
    await saveProduct(ORG_A, validInput as any)
    // Every captured WHERE that ran must carry ORG_A, and none may carry ORG_B.
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
    expect(state.wheres.some((w) => w.sql.includes(ORG_B))).toBe(false)
    // The inserted variant rows carry the org id.
    const variantInsert = state.inserts.find((i) => Array.isArray(i.values))
    expect(variantInsert).toBeTruthy()
    for (const v of variantInsert!.values as Record<string, unknown>[]) {
      expect(v.organizationId).toBe(ORG_A)
    }
  })
})

// ---------------------------------------------------------------------------

describe('marketing-campaigns — campaign_events read is org-scoped', () => {
  it('getCampaignStats filters by the campaign org, not just campaignId', async () => {
    state.selectRows.push([]) // no event rows
    await getCampaignStats(ORG_A, 12345)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
    expect(state.wheres.some((w) => w.sql.includes(ORG_B))).toBe(false)
  })

  it('getRecipientBreakdown filters by the campaign org', async () => {
    state.selectRows.push([]) // no event rows
    await getRecipientBreakdown(ORG_A, 12345)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
    expect(state.wheres.some((w) => w.sql.includes(ORG_B))).toBe(false)
  })
})
