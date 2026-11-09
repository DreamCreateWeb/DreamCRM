import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

/**
 * The chart access log (ML-31): the real insert values, the real WHERE
 * rendered through drizzle's dialect (org scoping), best-effort on failure.
 */

const state = {
  inserted: null as null | Record<string, unknown>,
  insertThrows: false,
  where: null as null | SQL,
  rows: [] as unknown[],
  selectThrows: false,
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return {
    schema,
    db: {
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          if (state.insertThrows) throw new Error('db down')
          state.inserted = v
        },
      }),
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: (w: SQL) => {
              state.where = w
              return {
                orderBy: () => ({
                  limit: async () => {
                    if (state.selectThrows) throw new Error('db down')
                    return state.rows
                  },
                }),
              }
            },
          }),
        }),
      }),
    },
  }
})

import {
  recordPatientAccess,
  listPatientAccess,
  listRecentExports,
  whoLookedLine,
  type PatientAccessRow,
} from '@/lib/services/patient-access-log'

const dialect = new PgDialect()

beforeEach(() => {
  state.inserted = null
  state.insertThrows = false
  state.where = null
  state.rows = []
  state.selectThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordPatientAccess', () => {
  it('inserts an org-scoped row with the action and detail', async () => {
    await recordPatientAccess('org_1', 'usr_1', 'view', 'pat_1')
    expect(state.inserted).toMatchObject({
      organizationId: 'org_1',
      userId: 'usr_1',
      action: 'view',
      patientId: 'pat_1',
      detail: null,
    })
    expect(String(state.inserted?.id)).toMatch(/^pal_/)
  })

  it('stores null patient_id for an export, with the row count', async () => {
    await recordPatientAccess('org_1', 'usr_1', 'export', null, { rows: 42 })
    expect(state.inserted).toMatchObject({ patientId: null, action: 'export', detail: { rows: 42 } })
  })

  it('never throws when the write fails (best-effort)', async () => {
    state.insertThrows = true
    await expect(recordPatientAccess('org_1', 'usr_1', 'view', 'pat_1')).resolves.toBeUndefined()
  })
})

describe('reads are org-scoped', () => {
  it('listPatientAccess filters by organization AND patient', async () => {
    await listPatientAccess('org_1', 'pat_1', 5)
    const q = dialect.sqlToQuery(state.where!)
    expect(q.sql).toContain('"patient_access_log"."organization_id" = $')
    expect(q.sql).toContain('"patient_access_log"."patient_id" = $')
    expect(q.params).toEqual(['org_1', 'pat_1'])
  })

  it('listRecentExports filters by organization, action and a null patient', async () => {
    await listRecentExports('org_9')
    const q = dialect.sqlToQuery(state.where!)
    expect(q.sql).toContain('"patient_access_log"."organization_id" = $')
    expect(q.sql).toContain('"patient_access_log"."action" = $')
    expect(q.sql).toContain('"patient_access_log"."patient_id" is null')
    expect(q.params).toEqual(['org_9', 'export'])
  })

  it('a failed read is an empty list, not an error', async () => {
    state.selectThrows = true
    expect(await listPatientAccess('org_1', 'pat_1')).toEqual([])
    expect(await listRecentExports('org_1')).toEqual([])
  })
})

describe('whoLookedLine', () => {
  const tz = 'America/Chicago'
  // 2026-11-04 03:30 UTC is still Nov 3 evening in Chicago.
  const now = new Date('2026-11-04T15:00:00Z')
  const row = (userId: string, userName: string, at: string, action: PatientAccessRow['action'] = 'view'): PatientAccessRow => ({
    id: `${userId}${at}`,
    patientId: 'pat_1',
    userId,
    userName,
    action,
    detail: null,
    at: new Date(at),
  })

  it('says today / yesterday against the clinic calendar, newest open per person', () => {
    const line = whoLookedLine(
      [
        row('u1', 'Dana Lee', '2026-11-04T14:00:00Z'),
        row('u1', 'Dana Lee', '2026-11-04T13:00:00Z'),
        // 02:00 UTC Nov 4 = 8 PM Nov 3 in Chicago -> yesterday, not today.
        row('u2', 'Priya Shah', '2026-11-04T02:00:00Z'),
      ],
      tz,
      now,
    )
    expect(line).toBe('Opened by Dana today, Priya yesterday')
  })

  it('ignores non-view rows and is empty when no one looked', () => {
    expect(whoLookedLine([row('u1', 'Dana', '2026-11-04T14:00:00Z', 'merge')], tz, now)).toBe('')
    expect(whoLookedLine([], tz, now)).toBe('')
  })
})
