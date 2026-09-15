import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE TRIAL-MILESTONE CLAIM, RENDERED FOR REAL.
 *
 * `sendDueTrialReminders` claims a milestone with one statement — append it to
 * `clinic_profile.trial_reminders_sent` only if the array does not already
 * contain it — and the sibling test file models that in JavaScript with
 * `drizzle-orm` mocked. That is the right way to assert the RESULT and
 * completely blind to how Postgres will PARSE the statement.
 *
 * The trap is the same one `tests/journey/autonomy-sql.test.ts` was written
 * for: drizzle binds an interpolated value as an untyped parameter, and both
 * operators this statement uses are overloaded — `jsonb || jsonb` also exists
 * as `jsonb || text`, and `jsonb - text` also exists as `jsonb - integer`.
 * Postgres answers an untyped `$n` there with 42P18 at parse time, so the
 * claim would fail for every clinic on every tick, and nothing that mocks
 * drizzle could see it.
 *
 * So this file uses the REAL sql template and the REAL dialect, and pins the
 * property that makes the statement parseable: every bound parameter carries
 * an explicit cast. No database required.
 */

const captured: { sets: unknown[]; wheres: unknown[] } = { sets: [], wheres: [] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: async () => [{ email: 'owner@x.com', name: 'Pat', role: 'owner' }] }),
          where: Object.assign(async () => rows, {}),
        }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          captured.sets.push(patch.trialRemindersSent)
          return {
            where: (w: unknown) => {
              captured.wheres.push(w)
              const res: any = {
                returning: async () => [{ organizationId: 'org_1' }],
                then: (resolve: (v: unknown) => void) => resolve(undefined),
              }
              return res
            },
          }
        },
      }),
    },
  }
})

const sendTrialReminderEmail = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/lib/email', () => ({
  sendTrialReminderEmail,
  sendBillingPastDueEmail: vi.fn(async () => undefined),
}))

const NOW = new Date('2026-06-22T12:00:00Z')
let rows: unknown[] = []

import { sendDueTrialReminders } from '@/lib/services/billing-notifications'

const dialect = new PgDialect()
/** A captured expression as Postgres will actually receive it. */
function render(expr: unknown): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(expr as never)
  return { sql: q.sql, params: q.params }
}

/** Every `$n` in the statement is immediately followed by a `::cast`. */
function expectEveryParamCast(text: string) {
  for (const m of Array.from(text.matchAll(/\$\d+/g))) {
    const after = text.slice(m.index! + m[0].length)
    expect(
      after.startsWith('::'),
      `parameter ${m[0]} is bound without a cast — Postgres cannot infer its type here:\n${text}`,
    ).toBe(true)
  }
}

beforeEach(() => {
  captured.sets.length = 0
  captured.wheres.length = 0
  sendTrialReminderEmail.mockReset()
  sendTrialReminderEmail.mockResolvedValue(undefined)
  rows = [
    {
      organizationId: 'org_1',
      trialEndsAt: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
      subscriptionStatus: 'trialing',
      stripeSubscriptionId: null,
      pendingPlanId: null,
      trialRemindersSent: [],
    },
  ]
})

describe('the trial-milestone claim as Postgres parses it', () => {
  it('the APPEND binds no untyped parameter — jsonb || is overloaded against text', async () => {
    await sendDueTrialReminders(NOW)
    const { sql: text, params } = render(captured.sets[0])
    expect(params).toContain('["d3"]')
    // The failure mode this pins: `… || $1` with $1 untyped is 42P18.
    expect(text).toContain('::jsonb')
    expectEveryParamCast(text)
  })

  it('the not-already-sent test binds its parameter as jsonb, not as text', async () => {
    await sendDueTrialReminders(NOW)
    // The claim's where() is and(eq(...), <the containment test>) — render the
    // whole predicate, which is what Postgres receives. The eq's parameter is
    // typed by the column it is compared to; the containment test's is not,
    // and `@>` has a jsonb form AND a text-array form.
    const { sql: text } = render(captured.wheres[0])
    expect(text).toMatch(/@> \$\d+::jsonb/)
  })

  it('the RELEASE binds no untyped parameter — jsonb - is overloaded against integer', async () => {
    sendTrialReminderEmail.mockRejectedValueOnce(new Error('Resend 503'))
    await sendDueTrialReminders(NOW)
    // sets[0] is the claim, sets[1] is the release the failed send triggers.
    const { sql: text, params } = render(captured.sets[1])
    expect(params).toContain('d3')
    expect(text).toContain('::text')
    expectEveryParamCast(text)
  })
})
