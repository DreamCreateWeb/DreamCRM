/**
 * Insurance-check readers/writers — every query carries the calling org's id
 * (ORG_A/ORG_B pattern), and the attach path only ever fills a NULL patient.
 *
 * Uses REAL drizzle-orm + the real schema (only @/lib/db is mocked) so the
 * captured where-clause is the genuine eq(...) fragments. Same harness as
 * tests/tenant-scoping/forms-recent-submissions.test.ts.
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
    db: {
      select: () => chain(),
      update: () => ({
        set: () => ({
          where: (clause: unknown) => {
            state.wheres.push(captureSql(clause))
            return { returning: async () => state.rows }
          },
        }),
      }),
    },
    schema,
  }
})

import {
  attachInsuranceCheckToPatient,
  getLatestInsuranceCheckForPatient,
  listInsuranceChecksForPatient,
  listRecentInsuranceChecks,
  getRememberedCard,
  rememberCheckedCard,
} from '@/lib/services/insurance-eligibility'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'

beforeEach(() => {
  state.wheres = []
  state.limits = []
  state.rows = []
})

describe('insurance check queries are org-scoped', () => {
  it('listRecentInsuranceChecks', async () => {
    await listRecentInsuranceChecks(ORG_A)
    await listRecentInsuranceChecks(ORG_B, 5)
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).not.toContain(ORG_B)
    expect(state.wheres[1]).toContain(ORG_B)
    expect(state.wheres[1]).not.toContain(ORG_A)
    expect(state.limits).toEqual([20, 5])
  })

  it('getLatestInsuranceCheckForPatient carries the org AND the patient', async () => {
    await getLatestInsuranceCheckForPatient(ORG_A, 'pat_1')
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).toContain('pat_1')
    expect(state.wheres[0]).not.toContain(ORG_B)
    expect(state.limits).toEqual([1])
  })

  it('listInsuranceChecksForPatient', async () => {
    await listInsuranceChecksForPatient(ORG_B, 'pat_9')
    expect(state.wheres[0]).toContain(ORG_B)
    expect(state.wheres[0]).toContain('pat_9')
    expect(state.wheres[0]).not.toContain(ORG_A)
    expect(state.limits).toEqual([10])
  })

  it('attachInsuranceCheckToPatient scopes the update to the org + check, and reports whether a row moved', async () => {
    state.rows = [{ id: 'ins_1' }]
    expect(await attachInsuranceCheckToPatient(ORG_A, 'ins_1', 'pat_1')).toBe(true)
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).toContain('ins_1')
    expect(state.wheres[0]).not.toContain(ORG_B)
    state.rows = []
    expect(await attachInsuranceCheckToPatient(ORG_A, 'ins_already_attached', 'pat_1')).toBe(false)
  })

  it('maps a joined row to the view with the patient name assembled', async () => {
    state.rows = [
      {
        id: 'ins_1',
        organizationId: ORG_A,
        patientId: 'pat_1',
        requestedByUserId: 'u_1',
        driver: 'sandbox',
        status: 'active',
        input: { patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' }, carrierName: 'Delta Dental', memberId: 'X', groupNumber: null, relationship: 'self', subscriber: null },
        result: null,
        error: null,
        checkedAt: new Date('2026-09-20T15:00:00Z'),
        createdAt: new Date('2026-09-20T15:00:00Z'),
        patientFirstName: 'Mia',
        patientLastName: 'Hayes',
      },
      {
        id: 'ins_2',
        organizationId: ORG_A,
        patientId: null,
        requestedByUserId: null,
        driver: 'sandbox',
        status: 'not_found',
        input: { patient: { firstName: 'New', lastName: 'Person', dateOfBirth: '1990-01-01' }, carrierName: 'Cigna', memberId: 'Y', groupNumber: null, relationship: 'self', subscriber: null },
        result: null,
        error: null,
        checkedAt: new Date('2026-09-19T15:00:00Z'),
        createdAt: new Date('2026-09-19T15:00:00Z'),
        patientFirstName: null,
        patientLastName: null,
      },
    ]
    const out = await listRecentInsuranceChecks(ORG_A)
    expect(out[0].patientName).toBe('Mia Hayes')
    expect(out[0].checkedAtIso).toBe('2026-09-20T15:00:00.000Z')
    expect(out[1].patientName).toBeNull()
    expect(out[1].patientId).toBeNull()
  })

  it('rememberCheckedCard and getRememberedCard both carry the org id — a detail can never land on another clinic’s patient', async () => {
    state.wheres = []
    state.rows = [{ id: 'pat_1' }]
    const detail = { memberId: 'DD-1', payerId: null, payerName: 'Delta Dental', planName: null, relationship: 'self' as const, subscriber: null, source: 'check' as const, updatedAt: '2026-10-03T00:00:00.000Z' }
    expect(await rememberCheckedCard(ORG_A, 'pat_1', detail)).toBe(true)
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).toContain('pat_1')
    state.wheres = []
    state.rows = [{ detail, policy: 'DD-1' }]
    expect(await getRememberedCard(ORG_A, 'pat_1')).toMatchObject({ memberId: 'DD-1' })
    expect(state.wheres[0]).toContain(ORG_A)
    // A changed on-file card retires the detail at read time.
    state.rows = [{ detail, policy: 'CHANGED' }]
    expect(await getRememberedCard(ORG_A, 'pat_1')).toBeNull()
  })
})
