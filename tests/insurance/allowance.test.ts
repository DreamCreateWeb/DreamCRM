import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clinicMonthStart } from '@/lib/clinic-timezone'

/**
 * getInsuranceUsage — the billed-check counter behind the monthly allowance.
 * Pins: it SUMS billed_checks over THIS org's rows (a Full breakdown is one
 * row that cost several — 2026-10-08), the live driver only, since the
 * clinic-local month start; the env override; and the fail-open law (an
 * unreadable count is zero used + `unreadable`, never a refusal).
 */

const state = {
  count: 0,
  fail: false,
  wheres: [] as unknown[],
}

function flatten(clause: unknown): string[] {
  const out: string[] = []
  const seen = new Set<unknown>()
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out.push(String(v))
      continue
    }
    if (v instanceof Date) {
      out.push(v.toISOString())
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return out
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => ({
        from: () => ({
          where: async (clause: unknown) => {
            if (state.fail) throw new Error('db down')
            state.wheres.push(clause)
            return [{ n: state.count === 0 ? null : String(state.count) }]
          },
        }),
      }),
    },
  }
})
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: async () => 'America/Chicago' }))

import { getInsuranceUsage, includedMonthlyInsuranceChecks } from '@/lib/services/insurance-eligibility/allowance'

const NOW = new Date('2026-10-03T03:30:00Z') // Oct 2 at 10:30 PM in Chicago

beforeEach(() => {
  state.count = 0
  state.fail = false
  state.wheres = []
  delete process.env.INSURANCE_INCLUDED_MONTHLY_CHECKS
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getInsuranceUsage', () => {
  it('counts this org’s LIVE-driver rows since the clinic-local month start', async () => {
    state.count = 12
    const usage = await getInsuranceUsage('org_a', NOW)
    expect(usage).toEqual({ used: 12, included: 200, unreadable: false })
    const parts = flatten(state.wheres[0])
    expect(parts).toContain('org_a')
    expect(parts).toContain('stedi')
    // The window opens at midnight Chicago on Oct 1 — not UTC's Oct 1, and not Oct 3's UTC date.
    expect(parts).toContain(clinicMonthStart(NOW, 'America/Chicago').toISOString())
    expect(clinicMonthStart(NOW, 'America/Chicago').toISOString()).toBe('2026-10-01T05:00:00.000Z')
  })

  it('an unreadable count FAILS OPEN: zero used, flagged unreadable, nothing thrown', async () => {
    state.fail = true
    const usage = await getInsuranceUsage('org_a', NOW)
    expect(usage).toEqual({ used: 0, included: 200, unreadable: true })
  })

  it('the included number is env-overridable per platform, with junk falling back to 200', () => {
    expect(includedMonthlyInsuranceChecks({})).toBe(200)
    expect(includedMonthlyInsuranceChecks({ INSURANCE_INCLUDED_MONTHLY_CHECKS: '500' })).toBe(500)
    expect(includedMonthlyInsuranceChecks({ INSURANCE_INCLUDED_MONTHLY_CHECKS: '0' })).toBe(200)
    expect(includedMonthlyInsuranceChecks({ INSURANCE_INCLUDED_MONTHLY_CHECKS: 'lots' })).toBe(200)
  })
})
