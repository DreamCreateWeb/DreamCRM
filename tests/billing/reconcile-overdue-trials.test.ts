import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE BACKSTOP BEHIND "STRIPE OWNS THE CLOCK".
 *
 * A trial with a card on file is never walled on our clock (lib/trial.ts): at
 * its end date Stripe is converting it and the webhook is seconds behind. The
 * price of that rule is a row that says "on trial" FOREVER if the webhook
 * never comes — full access, nobody billing it, and no test of the trial
 * state would ever notice, because the state is doing exactly what it was
 * told. `reconcileOverdueTrials` is what bounds it: anything still recorded
 * as a Stripe trial hours past its end is re-read from Stripe.
 *
 * Two halves, because they fail differently: the PREDICATE (rendered through
 * the real dialect — a mocked db cannot see a wrong WHERE) and the LOOP
 * (one bad subscription must not stop the rest).
 */

const state = {
  rows: [] as Array<{ organizationId: string; stripeSubscriptionId: string | null }>,
  where: null as unknown,
  limit: null as number | null,
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => {
        const api: Record<string, unknown> = {}
        api.from = () => api
        api.where = (w: unknown) => {
          // Only the sweep's own query is the subject; the sync's reads
          // (by org) come back as an existing premium profile.
          if (state.where === null) state.where = w
          return api
        }
        api.limit = async (n: number) => {
          if (state.limit === null) {
            state.limit = n
            return state.rows
          }
          return [{ socialAddon: 0, planTier: 'premium' }]
        }
        return api
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(vals)
          },
        }),
      }),
    },
  }
})

vi.mock('@/lib/stripe', () => ({
  stripe: { subscriptions: { retrieve: vi.fn() } },
}))

vi.mock('@/lib/stripe-config', () => ({
  PLANS: [],
  getPlanByPriceId: () => undefined,
  isSocialAddonPriceId: () => false,
}))

vi.mock('@/lib/services/clinic-site-cache', () => ({
  invalidateClinicSiteForOrgUnlessRendering: vi.fn(async () => undefined),
}))

import { reconcileOverdueTrials } from '@/lib/services/billing'
import { stripe } from '@/lib/stripe'

const NOW = new Date('2026-12-08T12:00:00Z')
const dialect = new PgDialect()

const stripeSub = (id: string, status: string) =>
  ({ id, status, customer: 'cus_1', metadata: { organizationId: `org_${id}` }, items: { data: [] }, trial_end: null }) as never

beforeEach(() => {
  state.rows = []
  state.where = null
  state.limit = null
  state.updates = []
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('reconcileOverdueTrials — the predicate as Postgres receives it', () => {
  it('asks for Stripe trials (status AND a subscription id) whose end date is more than two hours gone', async () => {
    await reconcileOverdueTrials(NOW)
    const { sql: text, params } = dialect.sqlToQuery(state.where as never)
    expect(text).toMatch(/"subscription_status" = \$1/)
    expect(text).toMatch(/"stripe_subscription_id" is not null/)
    expect(text).toMatch(/"trial_ends_at" < \$2/)
    expect(text).not.toMatch(/ or /)
    expect(params[0]).toBe('trialing')
    // Two hours of grace: Stripe charges the first invoice about an hour
    // after the trial ends, so a row inside that window is simply on time.
    expect(new Date(params[1] as string).getTime()).toBe(NOW.getTime() - 2 * 60 * 60 * 1000)
  })

  it('is bounded — one Stripe read per row, so a backlog cannot run the cron out of time', async () => {
    await reconcileOverdueTrials(NOW)
    expect(state.limit).toBe(50)
  })
})

describe('reconcileOverdueTrials — the loop', () => {
  it('a healthy system finds nothing and calls Stripe not at all', async () => {
    expect(await reconcileOverdueTrials(NOW)).toEqual({ checked: 0, failed: 0 })
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
  })

  it('writes back whatever Stripe says — converted, failed card, or ended', async () => {
    state.rows = [
      { organizationId: 'org_a', stripeSubscriptionId: 'a' },
      { organizationId: 'org_b', stripeSubscriptionId: 'b' },
      { organizationId: 'org_c', stripeSubscriptionId: 'c' },
    ]
    vi.mocked(stripe.subscriptions.retrieve)
      .mockResolvedValueOnce(stripeSub('a', 'active'))
      .mockResolvedValueOnce(stripeSub('b', 'past_due'))
      .mockResolvedValueOnce(stripeSub('c', 'canceled'))
    expect(await reconcileOverdueTrials(NOW)).toEqual({ checked: 3, failed: 0 })
    expect(state.updates.map((u) => u.subscriptionStatus)).toEqual(['active', 'past_due', 'canceled'])
  })

  it('one subscription Stripe cannot find does not stop the rest, and is counted', async () => {
    state.rows = [
      { organizationId: 'org_gone', stripeSubscriptionId: 'gone' },
      { organizationId: 'org_ok', stripeSubscriptionId: 'ok' },
    ]
    vi.mocked(stripe.subscriptions.retrieve)
      .mockRejectedValueOnce(new Error('No such subscription'))
      .mockResolvedValueOnce(stripeSub('ok', 'active'))
    expect(await reconcileOverdueTrials(NOW)).toEqual({ checked: 2, failed: 1 })
    expect(state.updates.map((u) => u.subscriptionStatus)).toEqual(['active'])
  })
})
