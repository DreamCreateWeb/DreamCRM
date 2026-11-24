import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE SHUTDOWN LIST'S PREFILTER, RENDERED FOR REAL.
 *
 * `listShutDownOrgIds` asks the database for candidate rows and then runs the
 * pure rule (`resolveTrialState(...).expired`) over them. The sibling file
 * mocks `drizzle-orm`, so it proves the RULE and is physically unable to see
 * the PREFILTER: whatever the `where()` says, the mock hands back the rows.
 *
 * That gap is exactly where the 2026-11-23 ruling could go wrong. Until then
 * every closed clinic had an end date, and the prefilter was
 * `trial_ends_at is not null`. A signup that has not added its card is closed
 * and has NO end date — so under the old predicate it never reaches the rule,
 * the list comes back without it, and every engine that asks "is this clinic
 * shut down?" in bulk (reminders, review asks, campaigns, the PMS sync) runs
 * for an account that never finished signing up.
 *
 * So this renders the real statement through the real dialect and pins the
 * disjunction. It proves the SQL we send, not the rows Postgres returns.
 */

const captured: { where: unknown } = { where: null }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => ({
        from: () => ({
          where: async (w: unknown) => {
            captured.where = w
            return []
          },
        }),
      }),
    },
  }
})

import { listShutDownOrgIds } from '@/lib/services/billing-state'
import { AWAITING_CARD_STATUS } from '@/lib/trial'

const dialect = new PgDialect()

beforeEach(() => {
  captured.where = null
})

describe('the shutdown list prefilter as Postgres receives it', () => {
  it('admits a row with an end date OR a signup awaiting its card', async () => {
    await listShutDownOrgIds(new Date('2026-12-01T12:00:00Z'))
    expect(captured.where, 'listShutDownOrgIds no longer filters at all').not.toBeNull()
    const { sql: text, params } = dialect.sqlToQuery(captured.where as never)
    expect(text).toMatch(/"trial_ends_at" is not null/)
    expect(text).toMatch(/"subscription_status" = \$1/)
    expect(text).toMatch(/ or /)
    expect(params).toEqual([AWAITING_CARD_STATUS])
  })

  it('the awaiting-card half is a DISJUNCT, not a second condition every row must also meet', async () => {
    await listShutDownOrgIds(new Date('2026-12-01T12:00:00Z'))
    const { sql: text } = dialect.sqlToQuery(captured.where as never)
    // `and` here would shut down nobody but signups that somehow had an end
    // date — i.e. it would silently un-kill every expired trial.
    expect(text).not.toMatch(/ and /)
  })
})
