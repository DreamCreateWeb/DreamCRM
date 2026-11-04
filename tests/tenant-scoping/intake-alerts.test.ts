import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getIntakeAlertsForAppointments — TENANT SCOPING, rendered for real.
 *
 * The chair read joins form_submission to appointment on patient_id. Both
 * sides carry organization_id and BOTH must be filtered: a join scoped on
 * one side alone would let another clinic's submission ride a shared
 * patient id. Runs against drizzle's pg-proxy driver (the real dialect, the
 * real schema, the real SQL — no database), same harness as
 * tests/automation/reminder-claim.test.ts.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      return { rows: [] }
    },
    { schema },
  )
  return { db, schema }
})

import { getIntakeAlertsForAppointments } from '@/lib/services/intake-summary'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'

beforeEach(() => {
  captured.length = 0
})

describe('getIntakeAlertsForAppointments — scoping', () => {
  it('filters BOTH form_submission and appointment by the calling org, and only the asked-for visits', async () => {
    await getIntakeAlertsForAppointments(ORG_A, ['appt_1', 'appt_2'])
    expect(captured).toHaveLength(1)
    const { sql, params } = captured[0]!
    const lower = sql.toLowerCase()
    expect(lower).toContain('from "form_submission"')
    expect(lower).toContain('inner join "appointment"')
    expect(lower).toContain('"form_submission"."organization_id" = $')
    expect(lower).toContain('"appointment"."organization_id" = $')
    expect(lower).toContain('"appointment"."id" in ($')
    expect(lower).toContain('"form_submission"."ai_summary" is not null')
    expect(lower).toContain('order by "form_submission"."submitted_at" desc')
    // The org id is bound twice — once per table — and never the other org's.
    expect(params.filter((p) => p === ORG_A)).toHaveLength(2)
    expect(params).not.toContain(ORG_B)
    expect(params).toEqual(expect.arrayContaining(['appt_1', 'appt_2']))
  })

  it('ORG_B never sees ORG_A’s parameters', async () => {
    await getIntakeAlertsForAppointments(ORG_B, ['appt_9'])
    expect(captured[0]!.params).toContain(ORG_B)
    expect(captured[0]!.params).not.toContain(ORG_A)
  })
})
