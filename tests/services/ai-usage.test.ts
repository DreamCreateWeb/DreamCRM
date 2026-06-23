import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Shared AI-usage meter — period math, the count read (0 when no row), the
 * over-cap compare, and the atomic bump (insert … onConflictDoUpdate).
 */

let selectResult: Array<{ count: number }> = []
const inserts: Array<{ values: unknown; conflict: unknown }> = []
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    insert: () => ({
      values: (v: unknown) => ({ onConflictDoUpdate: async (c: unknown) => { inserts.push({ values: v, conflict: c }) } }),
    }),
  },
}))
vi.mock('@/lib/db/schema/platform', () => ({
  aiUsageCounter: { organizationId: 'org', period: 'period', kind: 'kind', count: 'count' },
}))
vi.mock('@/lib/utils', () => ({ newId: (p: string) => `${p}_1` }))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  sql: (s: unknown) => ({ s }),
}))

import { aiUsagePeriod, getAiUsageCount, isAiUsageOverCap, bumpAiUsage } from '@/lib/services/ai-usage'

beforeEach(() => {
  selectResult = []
  inserts.length = 0
})

describe('aiUsagePeriod', () => {
  it('formats YYYY-MM in UTC, zero-padded', () => {
    expect(aiUsagePeriod(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01')
    expect(aiUsagePeriod(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12')
  })
})

describe('getAiUsageCount', () => {
  it('returns 0 when there is no counter row', async () => {
    selectResult = []
    expect(await getAiUsageCount('org_1', 'insurance_ocr')).toBe(0)
  })
  it('returns the stored count', async () => {
    selectResult = [{ count: 37 }]
    expect(await getAiUsageCount('org_1', 'insurance_ocr')).toBe(37)
  })
})

describe('isAiUsageOverCap', () => {
  it('is false below the cap and true at/over it', async () => {
    selectResult = [{ count: 399 }]
    expect(await isAiUsageOverCap('org_1', 'insurance_ocr', 400)).toBe(false)
    selectResult = [{ count: 400 }]
    expect(await isAiUsageOverCap('org_1', 'insurance_ocr', 400)).toBe(true)
  })
})

describe('bumpAiUsage', () => {
  it('inserts a count=1 row under the given kind with an upsert', async () => {
    await bumpAiUsage('org_1', 'form_translate')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].values).toMatchObject({ organizationId: 'org_1', kind: 'form_translate', count: 1 })
    expect(inserts[0].conflict).toBeTruthy()
  })
})
