/**
 * listRecentSubmissions — the cross-template submissions index feeding
 * /intake-forms/submissions (the "Completed · 8 weeks" heartbeat's
 * destination).
 *
 * Pins:
 *   1. SCOPING — the single joined SELECT filters by organizationId
 *      (ORG_A/ORG_B pattern: each call carries its own org id and never
 *      the other's).
 *   2. Anonymous fills — a null patientId row falls back to a null
 *      patientName (the page then renders submitterName/Email) instead of
 *      fabricating one from the left-join's null columns.
 *   3. Name assembly — matched fills combine first + last, trimmed.
 *
 * Uses REAL drizzle-orm + the real schema (only @/lib/db is mocked) so the
 * captured where-clause is the genuine eq(...) fragments. Same harness as
 * tests/tenant-scoping/my-day-closed-per-week.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  wheres: [] as string[],
  limits: [] as number[],
  rows: [] as Array<Record<string, unknown>>,
}

// Walk a drizzle clause tree and collect every literal/param value so we can
// grep for the org ids (same technique as the other tenant-scoping tests).
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

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = (clause: unknown) => {
      state.wheres.push(captureSql(clause))
      return obj
    }
    obj.orderBy = () => obj
    obj.limit = async (n: number) => {
      state.limits.push(n)
      return state.rows
    }
    return obj
  }
  return { db: { select: () => chain() } }
})

import { listRecentSubmissions } from '@/lib/services/forms'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'

beforeEach(() => {
  state.wheres = []
  state.limits = []
  state.rows = []
})

describe('listRecentSubmissions', () => {
  it('scopes the joined query to the calling org (ORG_A/ORG_B)', async () => {
    await listRecentSubmissions(ORG_A)
    await listRecentSubmissions(ORG_B)
    expect(state.wheres).toHaveLength(2)
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).not.toContain(ORG_B)
    expect(state.wheres[1]).toContain(ORG_B)
    expect(state.wheres[1]).not.toContain(ORG_A)
  })

  it('caps at 50 by default and honors an explicit limit', async () => {
    await listRecentSubmissions(ORG_A)
    await listRecentSubmissions(ORG_A, 10)
    expect(state.limits).toEqual([50, 10])
  })

  it('assembles the patient name for matched fills, null for anonymous', async () => {
    state.rows = [
      {
        id: 'sub_1',
        submittedAt: new Date('2026-07-18T15:00:00Z'),
        templateId: 'tmpl_1',
        templateTitle: 'New Patient Intake',
        patientId: 'pat_1',
        patientFirstName: 'Jane',
        patientLastName: 'Doe',
        submitterName: 'Jane Doe',
        submitterEmail: 'jane@example.com',
      },
      {
        // Anonymous public fill — left-join hands back null patient columns.
        id: 'sub_2',
        submittedAt: new Date('2026-07-17T15:00:00Z'),
        templateId: 'tmpl_2',
        templateTitle: 'Records Release',
        patientId: null,
        patientFirstName: null,
        patientLastName: null,
        submitterName: 'Walk-in Visitor',
        submitterEmail: null,
      },
    ]
    const out = await listRecentSubmissions(ORG_A)
    expect(out).toHaveLength(2)
    expect(out[0].patientId).toBe('pat_1')
    expect(out[0].patientName).toBe('Jane Doe')
    expect(out[0].templateTitle).toBe('New Patient Intake')
    expect(out[1].patientId).toBeNull()
    expect(out[1].patientName).toBeNull()
    expect(out[1].submitterName).toBe('Walk-in Visitor')
  })
})
