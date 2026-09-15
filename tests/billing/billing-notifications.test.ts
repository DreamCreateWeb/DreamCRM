import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The owner-facing billing comms service: the escalating trial-reminder sweep
 * (cron) and the failed-payment dunning email (webhook). The trial logic
 * (resolveTrialState / dueTrialReminder) runs for real; db + email are mocked.
 *
 * The milestone is CLAIMED before the email goes out — the claim statement
 * itself is rendered against the real dialect in
 * `trial-milestone-claim-sql.test.ts`, which is the half this file is blind to.
 */

const state: {
  selectQueue: unknown[][]
  updates: Array<{ set: Record<string, unknown>; where: unknown }>
  /** Rows each `UPDATE … RETURNING` hands back, in order. Empty queue = the
   *  claim wins; push `[]` to make a run LOSE the race. */
  claimQueue: unknown[][]
  /** Whether the next update should throw (the claim write failing). */
  updateThrows: boolean
  calls: string[]
} = { selectQueue: [], updates: [], claimQueue: [], updateThrows: false, calls: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: (where: unknown) => {
            if (state.updateThrows) throw new Error('claim write: connection reset')
            state.updates.push({ set, where })
            state.calls.push('update')
            const res: any = {
              returning: async () =>
                state.claimQueue.length ? state.claimQueue.shift()! : [{ organizationId: 'org_1' }],
              then: (resolve: (v: unknown) => void) => resolve(undefined),
            }
            return res
          },
        }),
      }),
    },
    schema: {
      clinicProfile: {
        organizationId: 'organizationId',
        trialEndsAt: 'trialEndsAt',
        subscriptionStatus: 'subscriptionStatus',
        stripeSubscriptionId: 'stripeSubscriptionId',
        stripeCustomerId: 'stripeCustomerId',
        pendingPlanId: 'pendingPlanId',
        trialRemindersSent: 'trialRemindersSent',
      },
      member: { organizationId: 'organizationId', userId: 'userId', role: 'role' },
      user: { id: 'id', email: 'email', name: 'name' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _: 'and', a }),
  eq: (...a: unknown[]) => ({ _: 'eq', a }),
  gte: (...a: unknown[]) => ({ _: 'gte', a }),
  lte: (...a: unknown[]) => ({ _: 'lte', a }),
  inArray: (...a: unknown[]) => ({ _: 'inArray', a }),
  isNotNull: (...a: unknown[]) => ({ _: 'isNotNull', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ _: 'sql', strings: [...strings], values }),
    { raw: (s: string) => ({ _: 'raw', s }) },
  ),
}))

const emailMock = vi.hoisted(() => ({
  sendTrialReminderEmail: vi.fn(async () => undefined),
  sendBillingPastDueEmail: vi.fn(async () => undefined),
}))
vi.mock('@/lib/email', () => emailMock)

import {
  sendDueTrialReminders,
  getClinicOwnerContact,
  sendPaymentFailedEmailForCustomer,
} from '@/lib/services/billing-notifications'

const NOW = new Date('2026-06-22T12:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

function clinic(over: Record<string, unknown> = {}) {
  return {
    organizationId: 'org_1',
    trialEndsAt: inDays(3),
    subscriptionStatus: 'trialing',
    stripeSubscriptionId: null,
    pendingPlanId: null,
    trialRemindersSent: [],
    ...over,
  }
}

/** Milestone keys carried by the SQL of each update, in order. Both statements
 *  interpolate the COLUMN first and the milestone last; the append binds it as
 *  a one-element JSON array (`["d3"]`) and the release as a bare key (`d3`),
 *  which is how the two are told apart. */
function updateMilestones(): Array<{ milestone: string; kind: 'append' | 'release' }> {
  return state.updates.map(({ set }) => {
    const expr = set.trialRemindersSent as { values?: unknown[] }
    const strings = (expr?.values ?? []).filter((v): v is string => typeof v === 'string')
    const bound = strings[strings.length - 1]
    return bound.startsWith('[')
      ? { milestone: JSON.parse(bound)[0] as string, kind: 'append' as const }
      : { milestone: bound, kind: 'release' as const }
  })
}

beforeEach(() => {
  state.selectQueue.length = 0
  state.updates.length = 0
  state.claimQueue.length = 0
  state.updateThrows = false
  state.calls.length = 0
  emailMock.sendTrialReminderEmail.mockReset()
  emailMock.sendTrialReminderEmail.mockImplementation(async () => {
    state.calls.push('send')
  })
  emailMock.sendBillingPastDueEmail.mockClear()
})

describe('sendDueTrialReminders', () => {
  it('emails the due milestone to the owner and records it', async () => {
    state.selectQueue.push([clinic()]) // the window query
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat Owner', role: 'owner' }]) // owner lookup
    const r = await sendDueTrialReminders(NOW)
    expect(r).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 })
    expect(emailMock.sendTrialReminderEmail).toHaveBeenCalledWith('owner@x.com', {
      firstName: 'Pat Owner',
      milestone: 'd3',
      billingUrl: expect.stringContaining('/settings/billing'),
    })
    expect(updateMilestones()).toEqual([{ milestone: 'd3', kind: 'append' }])
  })

  it('is idempotent — skips a milestone already recorded (no email, no write)', async () => {
    state.selectQueue.push([clinic({ trialRemindersSent: ['d3'] })])
    const r = await sendDueTrialReminders(NOW)
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(emailMock.sendTrialReminderEmail).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('a paid clinic in the window is skipped (resolveTrialState wins)', async () => {
    state.selectQueue.push([
      clinic({ subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1', trialEndsAt: inDays(-2) }),
    ])
    const r = await sendDueTrialReminders(NOW)
    expect(r.sent).toBe(0)
    expect(emailMock.sendTrialReminderEmail).not.toHaveBeenCalled()
  })

  it('no billing contact → skipped WITHOUT recording (retries once an owner exists)', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([]) // owner lookup finds nobody
    const r = await sendDueTrialReminders(NOW)
    expect(r.skipped).toBe(1)
    expect(state.updates).toHaveLength(0)
  })

  it('sends the final-day (d1) milestone and points a managed clinic to activation', async () => {
    // ~12h left → ceil → daysLeft 1 → the final-day 'd1' email.
    state.selectQueue.push([clinic({ trialEndsAt: inDays(0.5), pendingPlanId: 'plan_pro' })])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    await sendDueTrialReminders(NOW)
    expect(emailMock.sendTrialReminderEmail).toHaveBeenCalledWith(
      'owner@x.com',
      expect.objectContaining({ milestone: 'd1', billingUrl: expect.stringContaining('/billing/activate') }),
    )
  })

  it('emails the "ended" milestone for an expired-unpaid clinic', async () => {
    state.selectQueue.push([clinic({ trialEndsAt: inDays(-1) })])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    await sendDueTrialReminders(NOW)
    expect(emailMock.sendTrialReminderEmail).toHaveBeenCalledWith(
      'owner@x.com',
      expect.objectContaining({ milestone: 'ended' }),
    )
    expect(updateMilestones()).toEqual([{ milestone: 'ended', kind: 'append' }])
  })

  // ── Claim before send ─────────────────────────────────────────────────────
  //
  // The milestone used to be stamped AFTER the email. Two runs of an
  // at-least-once cron both passed the in-JS `dueTrialReminder` check against
  // the same snapshot and both emailed; and a send that succeeded followed by
  // a stamp that failed re-emailed on the next tick. A trial reminder arriving
  // twice reads as a dunning notice from a company unsure whether you paid.

  it('writes the milestone before the email goes out, never after', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    await sendDueTrialReminders(NOW)
    expect(state.calls).toEqual(['update', 'send'])
  })

  it('sends nothing when a concurrent run already claimed the same milestone', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    state.claimQueue.push([]) // the claim UPDATE matched no row — we lost
    const r = await sendDueTrialReminders(NOW)
    expect(emailMock.sendTrialReminderEmail).not.toHaveBeenCalled()
    expect(r).toEqual({ scanned: 1, sent: 0, skipped: 1, failed: 0 })
  })

  it('releases the milestone when the send fails, so the next tick retries it', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    emailMock.sendTrialReminderEmail.mockRejectedValueOnce(new Error('Resend 503'))
    const r = await sendDueTrialReminders(NOW)
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    expect(updateMilestones()).toEqual([
      { milestone: 'd3', kind: 'append' },
      { milestone: 'd3', kind: 'release' },
    ])
  })

  it('counts a failed claim write as failed and sends nothing', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    state.updateThrows = true
    const r = await sendDueTrialReminders(NOW)
    expect(emailMock.sendTrialReminderEmail).not.toHaveBeenCalled()
    expect(r.failed).toBe(1)
  })
})

describe('getClinicOwnerContact', () => {
  it('prefers the owner over an admin', async () => {
    state.selectQueue.push([
      { email: 'admin@x.com', name: 'Adam Admin', role: 'admin' },
      { email: 'owner@x.com', name: 'Pat Owner', role: 'owner' },
    ])
    const c = await getClinicOwnerContact('org_1')
    expect(c).toEqual({ email: 'owner@x.com', name: 'Pat Owner' })
  })

  it('returns null when the org has no owner/admin', async () => {
    state.selectQueue.push([])
    expect(await getClinicOwnerContact('org_1')).toBeNull()
  })
})

describe('sendPaymentFailedEmailForCustomer', () => {
  it('resolves the org by customer id and dunning-emails the owner', async () => {
    state.selectQueue.push([{ organizationId: 'org_1', pendingPlanId: null }]) // profile by customer
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }]) // owner
    await sendPaymentFailedEmailForCustomer('cus_123', '$149.00 USD')
    expect(emailMock.sendBillingPastDueEmail).toHaveBeenCalledWith('owner@x.com', {
      firstName: 'Pat',
      amountLabel: '$149.00 USD',
      billingUrl: expect.stringContaining('/settings/billing'),
    })
  })

  it('no-ops when the customer maps to no clinic', async () => {
    state.selectQueue.push([]) // no profile
    await sendPaymentFailedEmailForCustomer('cus_unknown', '$10.00 USD')
    expect(emailMock.sendBillingPastDueEmail).not.toHaveBeenCalled()
  })
})
