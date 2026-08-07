import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getActivationChecklist — the Getting-started list derives done-state
 * from live org data and filters tasks by plan tier. The whole point is
 * honesty: a task is done only when the underlying thing actually exists.
 */

const state = {
  profile: null as Record<string, unknown> | null,
  hasPatient: false,
  hasInbox: false,
  hasReviewConfig: false,
  /** A HEALTHY, synced PMS connection (readiness only ticks on health). */
  hasPms: false,
  hasProduct: false,
  /** REAL social accounts (zernio platform != 'googlebusiness'). */
  socialCount: 0,
  memberCount: 1,
  onboardingRow: null as Record<string, unknown> | null,
}

const upserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { patient, clinicReviewConfig, pmsConnection, pmsSyncRun, shopProduct, staffOnboarding, zernioAccount } =
    await import('@/lib/db/schema/clinic')
  const { emailAccount } = await import('@/lib/db/schema/email')
  const { member } = await import('@/lib/db/schema/auth')
  const schema = await import('@/lib/db/schema')

  function rowsFor(table: unknown): unknown[] {
    if (table === clinicProfile) return state.profile ? [state.profile] : []
    if (table === patient) return state.hasPatient ? [{ id: 'p1' }] : []
    if (table === emailAccount) return state.hasInbox ? [{ id: 'e1', syncStatus: 'ready' }] : []
    if (table === clinicReviewConfig) return state.hasReviewConfig ? [{ id: 'org' }] : []
    if (table === pmsConnection)
      return state.hasPms
        ? [
            {
              organizationId: 'org_1',
              provider: 'open_dental',
              status: 'connected',
              autoSyncEnabled: 1,
              lastSyncAt: new Date(),
              lastSyncStatus: 'success',
              lastError: null,
            },
          ]
        : []
    if (table === pmsSyncRun) return []
    if (table === shopProduct) return state.hasProduct ? [{ id: 's1' }] : []
    // The readiness service selects a COUNT of non-GBP accounts from this
    // table (the mock chain ignores where-filters, so the count is fed
    // directly; the GBP-vs-social split itself is pinned by the pure-core
    // tests in tests/readiness/).
    if (table === zernioAccount) return [{ count: state.socialCount }]
    if (table === member) return [{ count: state.memberCount }]
    if (table === staffOnboarding) return state.onboardingRow ? [state.onboardingRow] : []
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
      insert: () => ({
        values: (vals: Record<string, unknown>) => ({
          onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
            upserts.push({ ...vals, ...set })
          },
        }),
      }),
    },
    schema,
  }
})

import { getActivationChecklist, getStaffOnboarding, dismissHint } from '@/lib/services/staff-onboarding'
import { ACTIVATION_TASK_DEFS } from '@/lib/types/onboarding'

beforeEach(() => {
  state.profile = { logoUrl: null, heroImageUrl: null, staff: null, hours: null, portalSettings: null }
  state.hasPatient = false
  state.hasInbox = false
  state.hasReviewConfig = false
  state.hasPms = false
  state.hasProduct = false
  state.socialCount = 0
  state.memberCount = 1
  state.onboardingRow = null
  upserts.length = 0
})

describe('getActivationChecklist', () => {
  it('a brand-new clinic: everything not-done, every task offered (no plan tiers)', async () => {
    const list = await getActivationChecklist('org_1')
    expect(list.doneCount).toBe(0)
    expect(list.allDone).toBe(false)
    const ids = list.tasks.map((t) => t.id)
    expect(ids).toContain('brand_website')
    expect(ids).toContain('invite_team')
    expect(ids).toContain('connect_social') // no minPlan — every clinic gets nudged
    expect(ids).toContain('add_patients')
    expect(ids).toContain('connect_pms')
  })

  it('premium tier sees the full task list in definition order', async () => {
    const list = await getActivationChecklist('org_1')
    expect(list.tasks.map((t) => t.id)).toEqual(ACTIVATION_TASK_DEFS.map((t) => t.id))
  })

  it('derives done-state from real data signals', async () => {
    state.profile = {
      logoUrl: 'https://cdn/logo.png',
      heroImageUrl: null,
      staff: [{ id: 's1', name: 'Dr. Reyes' }],
      hours: { mon: { open: '09:00', close: '17:00' } },
      portalSettings: { features: {} },
    }
    state.hasPatient = true
    state.hasReviewConfig = true
    state.memberCount = 3

    const list = await getActivationChecklist('org_1')
    const byId = Object.fromEntries(list.tasks.map((t) => [t.id, t.done]))
    expect(byId.brand_website).toBe(true) // logo set
    expect(byId.add_team).toBe(true) // staff array non-empty
    expect(byId.set_hours).toBe(true)
    expect(byId.invite_team).toBe(true) // >1 member
    expect(byId.add_patients).toBe(true)
    expect(byId.portal_setup).toBe(true)
    expect(byId.reviews_setup).toBe(true)
    expect(byId.connect_inbox).toBe(false)
    expect(byId.connect_social).toBe(false) // no channel connected
    expect(byId.connect_pms).toBe(false)
    expect(byId.open_shop).toBe(false)
    expect(list.doneCount).toBe(7)
    expect(list.allDone).toBe(false)
  })

  it('connect_social ticks on a REAL social account (GBP alone no longer counts)', async () => {
    state.socialCount = 1
    const list = await getActivationChecklist('org_1')
    expect(list.tasks.find((t) => t.id === 'connect_social')?.done).toBe(true)
  })

  it('allDone flips when every signal is present AND healthy', async () => {
    state.profile = {
      logoUrl: 'x',
      heroImageUrl: null,
      staff: [{}],
      // Not the untouched Mon–Fri 9–5 seed → counts as confirmed.
      hours: { mon: { open: '08:00', close: '16:00' } },
      // `{}` no longer counts as configured — a real choice does.
      portalSettings: { features: { billing: true } },
    }
    state.hasPatient = true
    state.hasInbox = true
    state.hasReviewConfig = true
    state.hasPms = true
    state.hasProduct = true
    state.socialCount = 1
    state.memberCount = 2
    const list = await getActivationChecklist('org_1')
    expect(list.allDone).toBe(true)
  })

  it('a HEALTHY synced PMS connection ticks connect_pms (health, not row-existence — the broken/never-synced grades are pinned in tests/readiness/)', async () => {
    state.hasPms = true
    const list = await getActivationChecklist('org_1')
    expect(list.tasks.find((t) => t.id === 'connect_pms')?.done).toBe(true)
  })

  it('`{}` portal settings no longer count as configured', async () => {
    state.profile = { logoUrl: null, heroImageUrl: null, staff: null, hours: null, portalSettings: {} }
    const list = await getActivationChecklist('org_1')
    expect(list.tasks.find((t) => t.id === 'portal_setup')?.done).toBe(false)
  })

  it('the untouched hours seed does not tick set_hours', async () => {
    state.profile = {
      logoUrl: null,
      heroImageUrl: null,
      staff: null,
      hoursSource: 'manual',
      hours: {
        mon: { open: '09:00', close: '17:00' },
        tue: { open: '09:00', close: '17:00' },
        wed: { open: '09:00', close: '17:00' },
        thu: { open: '09:00', close: '17:00' },
        fri: { open: '09:00', close: '17:00' },
        sat: { open: null, close: null },
        sun: { open: null, close: null },
      },
      portalSettings: null,
    }
    const list = await getActivationChecklist('org_1')
    expect(list.tasks.find((t) => t.id === 'set_hours')?.done).toBe(false)
  })

  it('hero image counts for brand_website when there is no logo', async () => {
    state.profile = { logoUrl: null, heroImageUrl: 'https://cdn/hero.jpg', staff: null, hours: null, portalSettings: null }
    const list = await getActivationChecklist('org_1')
    expect(list.tasks.find((t) => t.id === 'brand_website')?.done).toBe(true)
  })
})

describe('staff onboarding state', () => {
  it('defaults when no row exists', async () => {
    const s = await getStaffOnboarding('org_1', 'usr_1')
    expect(s).toEqual({ welcomeSeen: false, checklistDismissed: false, dismissedHints: [] })
  })

  it('reads the stored row', async () => {
    state.onboardingRow = {
      welcomeSeenAt: new Date(),
      checklistDismissedAt: null,
      dismissedHints: ['patients'],
    }
    const s = await getStaffOnboarding('org_1', 'usr_1')
    expect(s.welcomeSeen).toBe(true)
    expect(s.checklistDismissed).toBe(false)
    expect(s.dismissedHints).toEqual(['patients'])
  })

  it('dismissHint appends without duplicating', async () => {
    state.onboardingRow = { welcomeSeenAt: null, checklistDismissedAt: null, dismissedHints: ['patients'] }
    await dismissHint('org_1', 'usr_1', 'patients')
    expect(upserts).toHaveLength(0) // already dismissed → no write

    await dismissHint('org_1', 'usr_1', 'reviews')
    expect(upserts).toHaveLength(1)
    expect(upserts[0].dismissedHints).toEqual(['patients', 'reviews'])
  })
})
