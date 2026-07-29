import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE TRUST WRITE, RENDERED FOR REAL (round-3 Phase-3 audit).
 *
 * setCapabilityTrust merges clinic_profile.autonomy in SQL so a concurrent
 * grant can never drop a revoke. The sibling test file mocks `drizzle-orm`
 * to model that merge in JavaScript — which is the right way to assert the
 * RESULT, and completely blind to how Postgres will parse the statement.
 * It shipped a statement that fails with 42P18 ("could not determine data
 * type of parameter") on every grant and every revoke: drizzle binds
 * interpolated values as untyped parameters, and Postgres cannot resolve an
 * untyped parameter inside jsonb_build_object (VARIADIC "any") or against
 * the overloaded jsonb `-` operator.
 *
 * So this file uses the REAL sql template and the REAL dialect, and pins the
 * one property that makes the statement parseable: every bound parameter
 * carries an explicit cast. No database required.
 */

const captured: { autonomy?: unknown } = {}
const profiles = [{ organizationId: 'org_1', autonomy: null as unknown }]

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => profiles }) }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          captured.autonomy = patch.autonomy
          return { where: async () => undefined }
        },
      }),
    },
  }
})
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: vi.fn(async () => true),
  listRecentActions: vi.fn(async () => []),
}))

import { setCapabilityTrust } from '@/lib/services/autonomy'

const dialect = new PgDialect()
/** The statement as Postgres will actually receive it. */
function render(): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(captured.autonomy as never)
  return { sql: q.sql, params: q.params }
}

beforeEach(() => {
  captured.autonomy = undefined
  profiles[0].autonomy = null
})

describe('the trust write as Postgres parses it', () => {
  it('a GRANT binds no untyped parameter — every $n carries a cast', async () => {
    await setCapabilityTrust('org_1', 'review_reply', 'auto', 'user_1')
    const { sql: text, params } = render()
    expect(params.length).toBeGreaterThan(0)
    // The failure mode this pins: jsonb_build_object($2, …) is unresolvable.
    expect(text).toContain('jsonb_build_object($')
    for (const m of Array.from(text.matchAll(/\$\d+/g))) {
      const after = text.slice(m.index! + m[0].length)
      expect(
        after.startsWith('::'),
        `parameter ${m[0]} is bound without a cast — Postgres cannot infer its type here:\n${text}`,
      ).toBe(true)
    }
  })

  it('a REVOKE binds no untyped parameter either — the jsonb "-" operator is overloaded', async () => {
    profiles[0].autonomy = { review_reply: 'auto', _grantedAt: { review_reply: 'x' } }
    await setCapabilityTrust('org_1', 'review_reply', 'ask', 'user_1')
    const { sql: text } = render()
    expect(text).toMatch(/- \$\d+::text/)
    for (const m of Array.from(text.matchAll(/\$\d+/g))) {
      const after = text.slice(m.index! + m[0].length)
      expect(after.startsWith('::'), `uncast parameter ${m[0]} in:\n${text}`).toBe(true)
    }
  })

  it('the merge reads the row’s OWN current value — never a snapshot the app read first', async () => {
    await setCapabilityTrust('org_1', 'review_reply', 'auto', 'user_1')
    const { sql: text } = render()
    // coalesce("clinic_profile"."autonomy", …) on both the outer merge and
    // the nested stamp map: that is what makes a concurrent revoke safe.
    expect(text.match(/"autonomy"/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
