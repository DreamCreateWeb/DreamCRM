import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE MILESTONE CLAIM, RENDERED FOR REAL (DREAMCRM-57).
 *
 * `sendDueTrialReminders` now takes a milestone with an
 * `UPDATE … WHERE NOT (… @> …) RETURNING` before it emails anyone, so two
 * overlapping cron runs cannot both send. Its sibling test file mocks
 * `drizzle-orm` and asserts the RESULT — the ordering, the release on failure,
 * the skip on a lost claim — and is completely blind to whether Postgres can
 * parse the statement at all.
 *
 * That blindness has cost this repo a production defect before: the trust
 * write shipped a statement that failed with 42P18 ("could not determine data
 * type of parameter") on every grant, because drizzle binds interpolated
 * values as UNTYPED parameters and Postgres cannot resolve an untyped
 * parameter inside `to_jsonb`, against the overloaded jsonb `-`, or against
 * `@>`. tests/journey/autonomy-sql.test.ts is the guard that came out of it;
 * this is the same guard for the same class of statement.
 *
 * So: the REAL sql templates, the REAL dialect, no database. Two properties —
 * every bound parameter carries an explicit cast, and the read is the row's
 * OWN current value rather than a snapshot the application read first.
 */

const captured: { patches: Record<string, unknown>[]; wheres: unknown[]; selectCall: number } = {
  patches: [],
  wheres: [],
  selectCall: 0,
}
const profiles = [
  {
    organizationId: 'org_1',
    trialEndsAt: new Date('2026-06-25T12:00:00Z'),
    subscriptionStatus: 'trialing',
    stripeSubscriptionId: null,
    pendingPlanId: null,
    trialRemindersSent: [] as string[],
  },
]

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const chain = (rows: unknown[]) => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.limit = async () => rows
    obj.then = (resolve: (v: unknown) => void) => resolve(rows)
    return obj
  }
  return {
    schema,
    db: {
      select: () => {
        captured.selectCall++
        // 1st: the trialing-window scan. 2nd: the owner/admin lookup.
        return chain(
          captured.selectCall === 1 ? profiles : [{ email: 'o@x.com', name: 'Pat', role: 'owner' }],
        )
      },
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (w: unknown) => {
            captured.patches.push(patch)
            captured.wheres.push(w)
            return {
              returning: async () => [{ organizationId: 'org_1' }],
              then: (resolve: (v: unknown) => void) => resolve(undefined),
            }
          },
        }),
      }),
    },
  }
})

vi.mock('@/lib/email', () => ({
  sendTrialReminderEmail: vi.fn(async () => undefined),
  sendBillingPastDueEmail: vi.fn(async () => undefined),
}))

import { sendDueTrialReminders } from '@/lib/services/billing-notifications'

const dialect = new PgDialect()
/** A fragment as Postgres will actually receive it. */
function render(fragment: unknown): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(fragment as never)
  return { sql: q.sql, params: q.params }
}

function everyParamIsCast(text: string) {
  for (const m of Array.from(text.matchAll(/\$\d+/g))) {
    const after = text.slice(m.index! + m[0].length)
    expect(
      after.startsWith('::'),
      `parameter ${m[0]} is bound without a cast — Postgres cannot infer its type here:\n${text}`,
    ).toBe(true)
  }
}

beforeEach(() => {
  captured.patches.length = 0
  captured.wheres.length = 0
  captured.selectCall = 0
})

describe('the trial-milestone claim as Postgres parses it', () => {
  it('binds no untyped parameter — to_jsonb and @> cannot infer one', async () => {
    await sendDueTrialReminders(new Date('2026-06-22T12:00:00Z'))

    const append = render(captured.patches[0].trialRemindersSent)
    expect(append.sql).toContain('to_jsonb($')
    everyParamIsCast(append.sql)

    // The guard's own jsonb half. `organization_id = $1` is deliberately NOT
    // required to carry a cast — Postgres infers a parameter compared against
    // a typed column; the unresolvable ones are the parameters that land
    // inside a jsonb function or against an overloaded jsonb operator.
    const guard = render(captured.wheres[0])
    expect(guard.sql).toContain('@>')
    expect(guard.sql).toMatch(/to_jsonb\(\$\d+::text\)/)
  })

  it('the guard and the append are ONE statement, both reading the row’s own value', async () => {
    await sendDueTrialReminders(new Date('2026-06-22T12:00:00Z'))

    // Both halves name the column rather than a value the app read first —
    // that is what makes two overlapping runs resolve to one winner, and what
    // stops a stale snapshot dropping a milestone another run just stamped.
    expect(render(captured.patches[0].trialRemindersSent).sql).toContain('"trial_reminders_sent"')
    expect(render(captured.wheres[0]).sql).toContain('"trial_reminders_sent"')
    // The guard is a NOT-contains, so the same milestone cannot be claimed twice.
    expect(render(captured.wheres[0]).sql).toMatch(/not\s*\(/i)
  })

  it('the release SUBTRACTS through the overloaded jsonb "-", cast', async () => {
    const { sendTrialReminderEmail } = await import('@/lib/email')
    ;(sendTrialReminderEmail as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error('Resend 503'))

    await sendDueTrialReminders(new Date('2026-06-22T12:00:00Z'))

    expect(captured.patches).toHaveLength(2)
    const release = render(captured.patches[1].trialRemindersSent)
    expect(release.sql).toMatch(/- \$\d+::text/)
    everyParamIsCast(release.sql)
  })
})
