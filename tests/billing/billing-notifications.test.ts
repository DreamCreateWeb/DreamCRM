import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The owner-facing billing comms service: the escalating trial-reminder sweep
 * (cron) and the failed-payment dunning email (webhook). The trial logic
 * (resolveTrialState / dueTrialReminder) runs for real; db + email are mocked.
 */

const state: {
  selectQueue: unknown[][]
  updates: Record<string, unknown>[]
  /** What each `.returning()` on an update yields, consumed in call order.
   *  The milestone CLAIM is an `UPDATE … WHERE NOT (… @> …) RETURNING`, so an
   *  empty array means "another run already holds this milestone". Default
   *  (queue empty) is "claim won". */
  claimReturns: unknown[][]
  /** Ordered log of everything that touched the world, so a test can assert
   *  the milestone is stamped BEFORE the email rather than after it — which is
   *  the whole defect. */
  ops: string[]
} = {
  selectQueue: [],
  updates: [],
  claimReturns: [],
  ops: [],
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
        set: (set: Record<string, unknown>) => {
          const land = () => {
            state.updates.push(set)
            state.ops.push('update')
          }
          // A plain THENABLE, not a native Promise: `await` on a native promise
          // uses internal machinery and never calls an overridden `.then`, so a
          // release (`await db.update()…where()`, no `.returning()`) would land
          // nowhere and the test would silently see one write instead of two.
          const where = () => ({
            returning: async () => {
              land()
              return state.claimReturns.length
                ? state.claimReturns.shift()!
                : [{ organizationId: 'org_1' }]
            },
            then: (resolve: (v: unknown) => void) => {
              land()
              resolve(undefined)
            },
          })
          return { where }
        },
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
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({ _: 'sql', strings: [...strings], vals }),
    { raw: (x: unknown) => x },
  ),
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
emailMock.sendTrialReminderEmail.mockImplementation(async () => {
  state.ops.push('email')
})
vi.mock('@/lib/email', () => emailMock)

import {
  sendDueTrialReminders,
  getClinicOwnerContact,
  sendPaymentFailedEmailForCustomer,
} from '@/lib/services/billing-notifications'

/** The milestone a claim/release statement names. The write is a SQL append
 *  now, not a JS array rebuild (DREAMCRM-57), so the assertion reads the bound
 *  value out of the template rather than comparing a whole array. */
function milestoneIn(patch: Record<string, unknown> | undefined): unknown {
  const v = patch?.trialRemindersSent as { _?: string; vals?: unknown[] } | undefined
  expect(v?._).toBe('sql')
  return v?.vals?.[1]
}

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
  state.claimReturns.length = 0
  state.ops.length = 0
  emailMock.sendTrialReminderEmail.mockReset()
  emailMock.sendTrialReminderEmail.mockImplementation(async () => {
    state.ops.push('email')
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
    // The milestone is CLAIMED (appended in SQL against the current value),
    // and — the defect — it happens BEFORE the email, not after it.
    expect(milestoneIn(state.updates[0])).toBe('d3')
    expect(state.ops).toEqual(['update', 'email'])
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
    expect(milestoneIn(state.updates[0])).toBe('ended')
    expect(state.ops).toEqual(['update', 'email'])
  })
})

describe('sendDueTrialReminders — the milestone is claimed, not stamped afterwards (DREAMCRM-57)', () => {
  it('stamps the milestone BEFORE the email goes out', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    await sendDueTrialReminders(NOW)
    // Stamping AFTER the send is the defect: the sweep reads every row at the
    // top, so a second overlapping run saw every not-yet-reached clinic as
    // un-stamped and mailed it again.
    expect(state.ops).toEqual(['update', 'email'])
  })

  it('a run that LOSES the claim does not email at all', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    state.claimReturns.push([]) // the conditional UPDATE matched no row

    const r = await sendDueTrialReminders(NOW)

    expect(emailMock.sendTrialReminderEmail).not.toHaveBeenCalled()
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.failed).toBe(0)
    expect(state.ops).toEqual(['update']) // the claim attempt, and nothing else
  })

  it('a failed send RELEASES the milestone so a later tick retries it', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    emailMock.sendTrialReminderEmail.mockRejectedValueOnce(new Error('Resend 503'))

    const r = await sendDueTrialReminders(NOW)

    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    // Claim, then release — otherwise a transient Resend blip would cost the
    // owner their "your trial ends in 3 days" warning permanently.
    expect(state.updates).toHaveLength(2)
    expect(milestoneIn(state.updates[0])).toBe('d3')
    expect(milestoneIn(state.updates[1])).toBe('d3')
    // The release SUBTRACTS rather than appends.
    const release = state.updates[1].trialRemindersSent as { strings: string[] }
    expect(release.strings.join('')).toContain(' - ')
    expect(release.strings.join('')).not.toContain('||')
  })

  it('a claim that itself throws counts as failed and never emails', async () => {
    state.selectQueue.push([clinic()])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])
    const realUpdate = state.claimReturns
    void realUpdate
    emailMock.sendTrialReminderEmail.mockClear()
    // Make the claim's returning() blow up by handing it a poisoned queue entry.
    state.claimReturns.push(null as unknown as unknown[])

    const r = await sendDueTrialReminders(NOW)

    expect(r.failed + r.skipped).toBe(1)
    expect(emailMock.sendTrialReminderEmail).not.toHaveBeenCalled()
  })

  it('appends in SQL against the CURRENT value, never rewriting the snapshot array', async () => {
    // The old write was `set({ trialRemindersSent: [...sent, milestone] })`,
    // where `sent` came from a select at the top of the sweep. A run stamping
    // 'd1' would DROP a 'd3' another run had stamped meanwhile — and the next
    // tick, seeing no 'd3', would send that milestone a second time.
    state.selectQueue.push([clinic({ trialEndsAt: inDays(0.5) })])
    state.selectQueue.push([{ email: 'owner@x.com', name: 'Pat', role: 'owner' }])

    await sendDueTrialReminders(NOW)

    const claim = state.updates[0].trialRemindersSent as { strings: string[]; vals: unknown[] }
    const text = claim.strings.join('?')
    expect(text).toContain('coalesce')
    expect(text).toContain('||')
    expect(claim.vals).toContain('d1')
    // Nothing resembling a JS array reached the column.
    expect(Array.isArray(state.updates[0].trialRemindersSent)).toBe(false)
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
