import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

/**
 * getLatestInsuranceChecksForPatients — the batched read behind the audit's
 * insurance_stale flag. Pins tenant scoping through drizzle's own dialect and
 * that only a RECOGNISED card's newest check counts.
 */

const h = vi.hoisted(() => ({ rows: [] as unknown[], where: null as unknown }))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: (w: unknown) => {
      h.where = w
      return chain
    },
    orderBy: () => Promise.resolve(h.rows),
  }
  return { db: { select: () => chain }, schema: actual }
})

import { getLatestInsuranceChecksForPatients } from '@/lib/services/insurance-eligibility'

const d = (s: string) => new Date(s)

beforeEach(() => {
  h.rows = []
  h.where = null
})

describe('getLatestInsuranceChecksForPatients', () => {
  it('scopes by org and patient ids in the rendered SQL', async () => {
    await getLatestInsuranceChecksForPatients('org_7', ['p1', 'p2'])
    const q = new PgDialect().sqlToQuery(h.where as SQL)
    expect(q.sql).toContain('"organization_id" = $1')
    expect(q.sql).toContain('"patient_id" in')
    expect(q.params).toEqual(expect.arrayContaining(['org_7', 'p1', 'p2']))
  })

  it('takes the newest RECOGNISED check per patient and skips unrecognised ones', async () => {
    h.rows = [
      { patientId: 'p1', status: 'error', checkedAt: d('2026-06-09') },
      { patientId: 'p1', status: 'active', checkedAt: d('2026-05-01') },
      { patientId: 'p1', status: 'active', checkedAt: d('2026-01-01') },
      { patientId: 'p2', status: 'not_found', checkedAt: d('2026-06-01') },
    ]
    const m = await getLatestInsuranceChecksForPatients('org_7', ['p1', 'p2'])
    expect(m.get('p1')?.checkedAt).toEqual(d('2026-05-01'))
    expect(m.has('p2')).toBe(false)
  })

  it('does not query for an empty list', async () => {
    const m = await getLatestInsuranceChecksForPatients('org_7', [])
    expect(m.size).toBe(0)
    expect(h.where).toBeNull()
  })
})
