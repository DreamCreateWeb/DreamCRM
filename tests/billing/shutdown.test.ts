import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE SHUTDOWN RESOLVER (owner ruling: "when a free trial ends, we kill
 * everything for that clinic"). One rule — resolveTrialState(...).expired,
 * the dashboard wall's own — behind every kill: site, portal, booking,
 * outbound engines, metered PMS sync. Pinned here: who is dead, who is
 * alive, and that an unreadable database FAILS OPEN (killing a paying
 * clinic's reminders on a DB blip is worse than one extra reminder from an
 * expired one).
 */

const state = {
  rows: [] as Array<Record<string, unknown>>,
  fail: false,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = () => api
    api.limit = async (n: number) => {
      if (state.fail) throw new Error('db down')
      return state.rows.slice(0, n)
    }
    ;(api as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      if (state.fail) return Promise.reject(new Error('db down')).then(onF, onR)
      return Promise.resolve(state.rows).then(onF, onR)
    }
    return api
  }
  return {
    db: { select: () => chain() },
    schema: {
      clinicProfile: {
        organizationId: {},
        trialEndsAt: {},
        subscriptionStatus: {},
        stripeSubscriptionId: {},
      },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
}))

import { listShutDownOrgIds, isClinicShutDown } from '@/lib/services/billing-state'

const NOW = new Date('2026-08-10T12:00:00Z')
const PAST = new Date('2026-08-01T12:00:00Z')
const FUTURE = new Date('2026-08-20T12:00:00Z')

beforeEach(() => {
  state.rows = []
  state.fail = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('listShutDownOrgIds', () => {
  it('an expired trial with no paid subscription is DEAD', async () => {
    state.rows = [
      { organizationId: 'org_dead', trialEndsAt: PAST, subscriptionStatus: null, stripeSubscriptionId: null },
    ]
    expect(await listShutDownOrgIds(NOW)).toEqual(new Set(['org_dead']))
  })

  it('an active trial, a paying clinic, and a past_due clinic all stay ALIVE', async () => {
    state.rows = [
      { organizationId: 'org_trial', trialEndsAt: FUTURE, subscriptionStatus: null, stripeSubscriptionId: null },
      { organizationId: 'org_paid', trialEndsAt: PAST, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
      // Dunning territory — past_due keeps access; the dunning flow nudges.
      { organizationId: 'org_dun', trialEndsAt: PAST, subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_2' },
    ]
    expect((await listShutDownOrgIds(NOW)).size).toBe(0)
  })

  it('a CANCELED subscription does not resurrect an expired trial', async () => {
    state.rows = [
      { organizationId: 'org_x', trialEndsAt: PAST, subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_3' },
    ]
    expect(await listShutDownOrgIds(NOW)).toEqual(new Set(['org_x']))
  })

  it('FAILS OPEN: an unreadable database shuts down nobody', async () => {
    state.fail = true
    expect((await listShutDownOrgIds(NOW)).size).toBe(0)
  })
})

describe('isClinicShutDown', () => {
  it('mirrors the list rule for one clinic; a missing profile is alive', async () => {
    state.rows = [{ trialEndsAt: PAST, subscriptionStatus: null, stripeSubscriptionId: null }]
    expect(await isClinicShutDown('org_dead', NOW)).toBe(true)
    state.rows = []
    expect(await isClinicShutDown('org_missing', NOW)).toBe(false)
    state.fail = true
    expect(await isClinicShutDown('org_blip', NOW)).toBe(false)
  })

  it('never-on-a-trial clinics (comped, legacy, demo) are never shut down', async () => {
    state.rows = [{ trialEndsAt: null, subscriptionStatus: null, stripeSubscriptionId: null }]
    expect(await isClinicShutDown('org_comped', NOW)).toBe(false)
  })
})
