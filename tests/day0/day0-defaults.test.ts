import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Day-0 defaults + their consequences. A real clinic finishes checkout with a
 * near-empty clinic_profile. We seed standard office hours so the LIVE /book
 * page + public footer don't read as "closed every day", and we leave the
 * genuinely-optional fields null (their resolvers degrade gracefully).
 *
 * This file drives the DB-backed pieces against a configurable mock:
 *   - seedClinicDay0Defaults (idempotent, only-fills-null)
 *   - getSlotsForDay (proves seeded hours actually produce bookable slots)
 *   - getActivationChecklist.siteNeedsPersonalization (the /welcome re-entry signal)
 */

interface HoursMap {
  [day: string]: { open?: string | null; close?: string | null; closed?: boolean }
}

const state: {
  // clinic_profile row served to every profile select
  profile: Record<string, unknown> | null
  appointments: Array<{ startTime: Date; endTime?: Date | null; status: string }>
  // captured update patches (the seed writes through db.update)
  updates: Array<Record<string, unknown>>
  // checklist auxiliary signals
  hasPatient: boolean
  hasInbox: boolean
  hasReviewConfig: boolean
  hasPms: boolean
  hasProduct: boolean
  memberCount: number
} = {
  profile: null,
  appointments: [],
  updates: [],
  hasPatient: false,
  hasInbox: false,
  hasReviewConfig: false,
  hasPms: false,
  hasProduct: false,
  memberCount: 1,
}

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { appointment, patient, clinicReviewConfig, pmsConnection, shopProduct } =
    await import('@/lib/db/schema/clinic')
  const { emailAccount } = await import('@/lib/db/schema/email')
  const { member } = await import('@/lib/db/schema/auth')
  const schema = await import('@/lib/db/schema')

  function rowsFor(t: unknown): unknown[] {
    if (t === clinicProfile) return state.profile ? [state.profile] : []
    if (t === appointment) return state.appointments
    if (t === patient) return state.hasPatient ? [{ id: 'p1' }] : []
    if (t === emailAccount) return state.hasInbox ? [{ id: 'e1' }] : []
    if (t === clinicReviewConfig) return state.hasReviewConfig ? [{ id: 'org' }] : []
    if (t === pmsConnection) return state.hasPms ? [{ id: 'org' }] : []
    if (t === shopProduct) return state.hasProduct ? [{ id: 's1' }] : []
    if (t === member) return [{ count: state.memberCount }]
    return []
  }

  type Chain = Promise<unknown[]> & Record<string, unknown>
  function chain(rows: unknown[]): Chain {
    const p = Promise.resolve(rows) as Chain
    p.from = (t: unknown) => chain(rowsFor(t))
    p.where = () => p
    p.limit = () => p
    p.innerJoin = () => p
    p.orderBy = () => p
    return p
  }

  return {
    db: {
      select: () => chain([]),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(patch)
          },
        }),
      }),
    },
    schema,
  }
})

import { seedClinicDay0Defaults, DEFAULT_CLINIC_HOURS } from '@/lib/onboarding/defaults'
import { getSlotsForDay } from '@/lib/services/booking'
import { getActivationChecklist } from '@/lib/services/staff-onboarding'
import { STARTER_TAGLINE } from '@/lib/services/starter-pack'

// A future weekday so generated slots aren't all filtered out as "past".
function dateKeyForWeekday(targetDow: number): string {
  const base = Date.UTC(2099, 5, 1) // 2099-06-01
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + i * 86_400_000)
    if (d.getUTCDay() === targetDow) return d.toISOString().slice(0, 10)
  }
  return '2099-06-01'
}
const MONDAY = dateKeyForWeekday(1)
const SUNDAY = dateKeyForWeekday(0)

beforeEach(() => {
  state.profile = null
  state.appointments = []
  state.updates = []
  state.hasPatient = false
  state.hasInbox = false
  state.hasReviewConfig = false
  state.hasPms = false
  state.hasProduct = false
  state.memberCount = 1
})

describe('DEFAULT_CLINIC_HOURS', () => {
  it('is a standard Mon–Fri 9–5, weekends closed', () => {
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) {
      expect(DEFAULT_CLINIC_HOURS[d]).toEqual({ open: '09:00', close: '17:00' })
    }
    expect(DEFAULT_CLINIC_HOURS.sat).toEqual({ open: null, close: null })
    expect(DEFAULT_CLINIC_HOURS.sun).toEqual({ open: null, close: null })
  })
})

describe('seedClinicDay0Defaults', () => {
  it('seeds hours when the profile has none', async () => {
    state.profile = { hours: null }
    await seedClinicDay0Defaults('org_1')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].hours).toEqual(DEFAULT_CLINIC_HOURS)
    expect(state.updates[0].updatedAt).toBeInstanceOf(Date)
  })

  it('is idempotent — does NOT overwrite hours the clinic already set', async () => {
    state.profile = { hours: { mon: { open: '07:00', close: '19:00' } } }
    await seedClinicDay0Defaults('org_1')
    expect(state.updates).toHaveLength(0) // nothing to seed → no write
  })

  it('no-ops cleanly when the profile row is missing', async () => {
    state.profile = null
    await expect(seedClinicDay0Defaults('org_missing')).resolves.toBeUndefined()
    expect(state.updates).toHaveLength(0)
  })
})

describe('booking with seeded default hours (the "closed every day" fix)', () => {
  it('a clinic on DEFAULT_CLINIC_HOURS offers bookable slots on a weekday', async () => {
    // Simulate the post-seed profile.
    state.profile = { hours: DEFAULT_CLINIC_HOURS, timezone: 'UTC' }
    const { slots, closedReason } = await getSlotsForDay('org_1', MONDAY)
    expect(closedReason).toBeNull()
    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.available)).toBe(true) // no appointments booked
    // 9:00–17:00 in 30-min slots = 16 slots.
    expect(slots).toHaveLength(16)
  })

  it('weekends stay closed under the default hours', async () => {
    state.profile = { hours: DEFAULT_CLINIC_HOURS, timezone: 'UTC' }
    const { slots, closedReason } = await getSlotsForDay('org_1', SUNDAY)
    expect(slots).toHaveLength(0)
    expect(closedReason).toBe('day_closed')
  })

  it('CONTRAST: a clinic with NULL hours is closed every single day', async () => {
    // This is exactly the broken day-0 state the seed fixes — every day reads
    // as closed on a live /book page until hours exist.
    state.profile = { hours: null, timezone: 'UTC' }
    for (const dow of [1, 2, 3, 4, 5]) {
      const { slots, closedReason } = await getSlotsForDay('org_1', dateKeyForWeekday(dow))
      expect(slots).toHaveLength(0)
      expect(closedReason).toBe('day_closed')
    }
  })
})

describe('getActivationChecklist.siteNeedsPersonalization — /welcome re-entry signal', () => {
  // With the day-0 floor in place a fresh site is never EMPTY, so the signal is
  // no longer "no tagline/about/services" — it's "interview never completed OR
  // tagline still the Wave-1 starter constant". The checklist now selects
  // `tagline` + `onboardingInterviewCompletedAt` (not about/services).
  it('true for a fresh clinic that still carries the day-0 starter tagline', async () => {
    state.profile = {
      logoUrl: null,
      heroImageUrl: null,
      staff: null,
      hours: null,
      portalSettings: null,
      tagline: STARTER_TAGLINE,
      onboardingInterviewCompletedAt: null,
    }
    const list = await getActivationChecklist('org_1', 'basic')
    expect(list.siteNeedsPersonalization).toBe(true)
  })

  it('true when the interview was never completed even if a real tagline was hand-written', async () => {
    state.profile = {
      logoUrl: null,
      heroImageUrl: null,
      staff: null,
      hours: null,
      portalSettings: null,
      tagline: 'We make Austin smile',
      onboardingInterviewCompletedAt: null,
    }
    const list = await getActivationChecklist('org_1', 'basic')
    expect(list.siteNeedsPersonalization).toBe(true)
  })

  it('false once the interview is completed AND the tagline is no longer the starter', async () => {
    state.profile = {
      logoUrl: null,
      heroImageUrl: null,
      staff: null,
      hours: null,
      portalSettings: null,
      tagline: 'We make Austin smile',
      onboardingInterviewCompletedAt: new Date(),
    }
    const list = await getActivationChecklist('org_1', 'basic')
    expect(list.siteNeedsPersonalization).toBe(false)
  })

  it('true when completed but the tagline is STILL the starter (a skip kept the floor)', async () => {
    // completeInterview stamps completed_at even on a skip; if they never wrote
    // a real tagline the starter equality keeps it flagged as needs-personalization.
    state.profile = {
      logoUrl: null,
      heroImageUrl: null,
      staff: null,
      hours: null,
      portalSettings: null,
      tagline: STARTER_TAGLINE,
      onboardingInterviewCompletedAt: new Date(),
    }
    const list = await getActivationChecklist('org_1', 'basic')
    expect(list.siteNeedsPersonalization).toBe(true)
  })

  it('treats a blank tagline as still-starter when never completed', async () => {
    state.profile = {
      logoUrl: null,
      heroImageUrl: null,
      staff: null,
      hours: null,
      portalSettings: null,
      tagline: '   ',
      onboardingInterviewCompletedAt: null,
    }
    const list = await getActivationChecklist('org_1', 'basic')
    expect(list.siteNeedsPersonalization).toBe(true)
  })
})
