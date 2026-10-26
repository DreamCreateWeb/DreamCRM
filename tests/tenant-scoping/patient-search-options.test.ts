/**
 * searchPatientOptions (the "+ New booking" picker's search) carries the
 * calling org's id on every query, exactly like listPatientOptions — the
 * ORG_A/ORG_B pattern — and is capped at PATIENT_SEARCH_LIMIT.
 *
 * Uses REAL drizzle-orm + the real schema (only @/lib/db is mocked) so the
 * captured where-clause is the genuine eq(...) fragments. Same harness as
 * tests/tenant-scoping/insurance-checks.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  wheres: [] as string[],
  limits: [] as number[],
  rows: [] as Array<Record<string, unknown>>,
}

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
  return {
    db: { select: () => chain() },
    schema,
  }
})

import { searchPatientOptions, listPatientOptions, getPatientOption, PATIENT_SEARCH_LIMIT } from '@/lib/services/patients'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'

beforeEach(() => {
  state.wheres = []
  state.limits = []
  state.rows = []
})

describe('searchPatientOptions is org-scoped like listPatientOptions', () => {
  it('an empty query (the recent list) carries the org', async () => {
    await searchPatientOptions(ORG_A, '')
    await searchPatientOptions(ORG_B, '   ')
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).not.toContain(ORG_B)
    expect(state.wheres[1]).toContain(ORG_B)
    expect(state.wheres[1]).not.toContain(ORG_A)
    expect(state.limits).toEqual([PATIENT_SEARCH_LIMIT, PATIENT_SEARCH_LIMIT])
  })

  it('a typed query carries the org AND the term (name/email like + phone digits)', async () => {
    await searchPatientOptions(ORG_A, 'Zoe (555) 0199')
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).toContain('%zoe (555) 0199%')
    expect(state.wheres[0]).toContain('%5550199%')
    expect(state.wheres[0]).not.toContain(ORG_B)
  })

  it('escapes LIKE wildcards the way the messages search does', async () => {
    await searchPatientOptions(ORG_A, '50%')
    expect(state.wheres[0]).toContain('%50\\%%')
  })

  it('clamps a caller-supplied limit', async () => {
    await searchPatientOptions(ORG_A, 'mia', 500)
    expect(state.limits).toEqual([50])
  })

  it('maps rows to {id, name, hint} with phone beating email as the tiebreak', async () => {
    state.rows = [
      { id: 'p1', firstName: 'Emma', lastName: 'Lopez', email: 'emma@x.com', phone: '(512) 555-0101' },
      { id: 'p2', firstName: 'Marcus', lastName: 'Chen', email: 'marcus@x.com', phone: null },
      { id: 'p3', firstName: 'Zoe', lastName: 'Williams', email: null, phone: null },
    ]
    expect(await searchPatientOptions(ORG_A, '')).toEqual([
      { id: 'p1', name: 'Emma Lopez', hint: '(512) 555-0101' },
      { id: 'p2', name: 'Marcus Chen', hint: 'marcus@x.com' },
      { id: 'p3', name: 'Zoe Williams', hint: null },
    ])
  })

  it('getPatientOption (the pre-picked id behind ?new=1&patient=) carries the org AND the id, and maps the same shape', async () => {
    state.rows = [{ id: 'p2', firstName: 'Marcus', lastName: 'Chen', email: 'marcus@x.com', phone: null }]
    expect(await getPatientOption(ORG_A, 'p2')).toEqual({ id: 'p2', name: 'Marcus Chen', hint: 'marcus@x.com' })
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).toContain('p2')
    expect(state.wheres[0]).not.toContain(ORG_B)
    expect(state.limits[0]).toBe(1)
  })

  it('getPatientOption answers null for an id the org does not own (the row set is empty)', async () => {
    state.rows = []
    expect(await getPatientOption(ORG_B, 'pat_from_another_org')).toBeNull()
    expect(state.wheres[0]).toContain(ORG_B)
  })

  it('listPatientOptions (the guardian select) still carries the org', async () => {
    await listPatientOptions(ORG_B)
    expect(state.wheres[0]).toContain(ORG_B)
    expect(state.wheres[0]).not.toContain(ORG_A)
  })
})
