import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The owner-facing billing comms service: the escalating trial-reminder sweep
 * (cron) and the failed-payment dunning email (webhook). The trial logic
 * (resolveTrialState / dueTrialReminder) runs for real; db + email are mocked.
 */

const state: { selectQueue: unknown[][]; updates: Record<string, unknown>[] } = {
  selectQueue: [],
  updates: [],
}

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
          where: async () => {
            state.updates.push(set)
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

beforeEach(() => {
  state.selectQueue.length = 0
  state.updates.length = 0
  emailMock.sendTrialReminderEmail.mockClear()
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
    expect(state.updates[0]).toEqual({ trialRemindersSent: ['d3'] })
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
    expect(state.updates[0]).toEqual({ trialRemindersSent: ['ended'] })
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
