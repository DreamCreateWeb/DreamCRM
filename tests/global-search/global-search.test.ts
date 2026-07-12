import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext } from '@/lib/auth/context'

/**
 * Global ⌘K search — the unification surface. Under test: the launcher
 * view (quick actions + plan-filtered pages on empty query), the minimum
 * query length, entity-group shaping per tenant type, page matching, and
 * LIKE-wildcard escaping.
 */

const state = {
  patients: [] as Array<Record<string, unknown>>,
  leads: [] as Array<Record<string, unknown>>,
  visits: [] as Array<Record<string, unknown>>,
  threads: [] as Array<Record<string, unknown>>,
  clinics: [] as Array<Record<string, unknown>>,
  shopOrders: [] as Array<Record<string, unknown>>,
  savedViews: [] as Array<Record<string, unknown>>,
  applicants: [] as Array<Record<string, unknown>>,
  products: [] as Array<Record<string, unknown>>,
  reviews: [] as Array<Record<string, unknown>>,
  campaigns: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', async () => {
  const { patient, lead, appointment, patientThread, shopOrder, patientView, jobApplication, shopProduct, platformReview } =
    await import('@/lib/db/schema/clinic')
  const { organization } = await import('@/lib/db/schema/auth')
  const { campaigns } = await import('@/lib/db/schema/domain')
  const schema = await import('@/lib/db/schema')

  function rowsFor(table: unknown): unknown[] {
    if (table === patient) return state.patients
    if (table === lead) return state.leads
    if (table === appointment) return state.visits
    if (table === patientThread) return state.threads
    if (table === organization) return state.clinics
    if (table === shopOrder) return state.shopOrders
    if (table === patientView) return state.savedViews
    if (table === jobApplication) return state.applicants
    if (table === shopProduct) return state.products
    if (table === platformReview) return state.reviews
    if (table === campaigns) return state.campaigns
    return []
  }

  type Chain = Promise<unknown[]> & Record<string, unknown>
  function chain(rows: unknown[]): Chain {
    const p = Promise.resolve(rows) as Chain
    p.from = (t: unknown) => chain(rowsFor(t))
    p.innerJoin = () => p
    p.leftJoin = () => p
    p.where = () => p
    p.orderBy = () => p
    p.limit = () => p
    return p
  }

  return { db: { select: () => chain([]) }, schema }
})

import { globalSearch, likePattern } from '@/lib/services/global-search'

function ctx(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'u1',
    userEmail: 'a@b.com',
    userName: 'Test',
    platformAdmin: false,
    organizationId: 'org_1',
    organizationName: 'Acme',
    organizationSlug: 'acme',
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'premium',
    patientId: null,
    isDemo: false,
    ...overrides,
  }
}

beforeEach(() => {
  state.patients = []
  state.leads = []
  state.visits = []
  state.threads = []
  state.clinics = []
  state.shopOrders = []
  state.savedViews = []
  state.applicants = []
  state.products = []
  state.reviews = []
  state.campaigns = []
})

describe('likePattern', () => {
  it('wraps in %% and escapes LIKE wildcards', () => {
    expect(likePattern('mia')).toBe('%mia%')
    expect(likePattern('50%_off\\x')).toBe('%50\\%\\_off\\\\x%')
  })
})

describe('globalSearch — launcher view (empty query)', () => {
  it('returns quick actions + a Go-to page index for clinics', async () => {
    const groups = await globalSearch(ctx(), '')
    expect(groups[0].label).toBe('Quick actions')
    expect(groups[0].results.map((r) => r.id)).toContain('act-add-patient')
    const goTo = groups.find((g) => g.label === 'Go to')!
    expect(goTo.results.length).toBeGreaterThan(0)
  })

  it('plan-gates quick actions: basic tier loses the patients/agenda actions', async () => {
    const groups = await globalSearch(ctx({ planTier: 'basic' }), '')
    const actions = groups.find((g) => g.label === 'Quick actions')!
    const ids = actions.results.map((r) => r.id)
    expect(ids).not.toContain('act-add-patient')
    expect(ids).not.toContain('act-agenda-today')
    expect(ids).toContain('act-edit-site')
  })

  it('surfaces saved views as one-click launches', async () => {
    state.savedViews = [{ id: 'pview_1', name: 'No-shows', filters: { status: 'inactive' }, createdByName: null }]
    const groups = await globalSearch(ctx(), '')
    const views = groups.find((g) => g.label === 'Saved views')
    expect(views).toBeTruthy()
    const patView = views!.results.find((r) => r.href.startsWith('/patients'))
    expect(patView?.label).toBe('No-shows')
    expect(patView?.href).toBe('/patients?status=inactive')
  })

  it('omits the Saved views group when the clinic has none', async () => {
    state.savedViews = []
    const groups = await globalSearch(ctx(), '')
    expect(groups.find((g) => g.label === 'Saved views')).toBeUndefined()
  })

  it('platform tenant gets pages but no clinic quick actions', async () => {
    const groups = await globalSearch(ctx({ tenantType: 'platform' }), '')
    expect(groups.find((g) => g.label === 'Quick actions')).toBeUndefined()
    expect(groups.find((g) => g.label === 'Go to')).toBeDefined()
  })
})

describe('globalSearch — querying', () => {
  it('returns nothing for a 1-character query', async () => {
    const groups = await globalSearch(ctx(), 'm')
    expect(groups).toEqual([])
  })

  it('shapes clinic entity groups with deep links', async () => {
    state.patients = [
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', phone: null },
    ]
    state.visits = [
      { id: 'a1', type: 'cleaning', startTime: new Date('2026-06-15T14:00:00Z'), firstName: 'Mia', lastName: 'Hayes' },
    ]
    state.threads = [{ id: 't1', firstName: 'Mia', lastName: 'Hayes', status: 'open' }]
    const groups = await globalSearch(ctx(), 'mia')

    const patients = groups.find((g) => g.label === 'Patients')!
    expect(patients.results[0]).toMatchObject({
      label: 'Mia Hayes',
      sublabel: 'mia@x.com',
      href: '/patients/p1',
      kind: 'patient',
    })

    const visits = groups.find((g) => g.label === 'Upcoming visits')!
    // Deep-links straight to the visit's drawer (?appt=) rather than a name filter.
    expect(visits.results[0].href).toBe('/appointments?appt=a1')

    const threads = groups.find((g) => g.label === 'Conversations')!
    expect(threads.results[0].href).toBe('/messages?thread=t1')
  })

  it('searches applicants, products, reviews, and campaigns (new ⌘K coverage)', async () => {
    state.applicants = [{ id: 'a1', name: 'Jordan Lee', email: 'jordan@x.com', status: 'new' }]
    state.products = [{ id: 'pr1', name: 'Whitening Kit', status: 'active' }]
    state.reviews = [{ id: 'rv1', reviewerName: 'Happy Patient', comment: 'Great visit and friendly staff.' }]
    state.campaigns = [{ id: 7, name: 'Reactivation March', subject: 'We miss you', status: 'completed' }]
    const groups = await globalSearch(ctx(), 'jordan')

    expect(groups.find((g) => g.label === 'Applicants')!.results[0]).toMatchObject({
      label: 'Jordan Lee',
      href: '/website/careers',
      kind: 'applicant',
    })
    expect(groups.find((g) => g.label === 'Products')!.results[0]).toMatchObject({
      label: 'Whitening Kit',
      href: '/shop/products/pr1',
      kind: 'product',
    })
    expect(groups.find((g) => g.label === 'Reviews')!.results[0]).toMatchObject({
      label: 'Happy Patient',
      href: '/reviews/received',
      kind: 'review',
    })
    expect(groups.find((g) => g.label === 'Campaigns')!.results[0]).toMatchObject({
      label: 'Reactivation March',
      href: '/marketing/campaigns/7',
      kind: 'campaign',
    })
  })

  it('omits empty entity groups entirely', async () => {
    state.patients = [{ id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: null, phone: null }]
    const groups = await globalSearch(ctx(), 'mia')
    expect(groups.map((g) => g.label)).not.toContain('Leads')
    expect(groups.map((g) => g.label)).not.toContain('Conversations')
    expect(groups.map((g) => g.label)).not.toContain('Shop orders')
  })

  it('returns a Shop orders group for clinic tenants', async () => {
    state.shopOrders = [
      {
        id: 'ord_1',
        name: 'Daniel Park',
        email: 'daniel@x.com',
        status: 'paid',
        totalCents: 9500,
        firstName: 'Mia',
        lastName: 'Hayes',
      },
    ]
    const groups = await globalSearch(ctx(), 'mia')
    const orders = groups.find((g) => g.label === 'Shop orders')!
    expect(orders).toBeDefined()
    // Prefers the linked patient name, shows the total, links to the admin list.
    expect(orders.results[0]).toMatchObject({
      label: 'Mia Hayes — $95.00',
      sublabel: 'Paid order',
      href: '/shop/orders',
    })
  })

  it('matches pages by label substring', async () => {
    const groups = await globalSearch(ctx(), 'porta')
    const goTo = groups.find((g) => g.label === 'Go to')!
    expect(goTo.results.some((r) => r.href === '/settings/portal')).toBe(true)
  })

  it('platform tenant searches clinics, not patients', async () => {
    state.clinics = [{ id: 'o1', name: 'Acme Dental Demo', slug: 'acme-dental-demo' }]
    state.patients = [{ id: 'p1', firstName: 'Acme', lastName: 'Patient', email: null, phone: null }]
    const groups = await globalSearch(ctx({ tenantType: 'platform' }), 'acme')
    expect(groups.find((g) => g.label === 'Clinics')!.results[0].label).toBe('Acme Dental Demo')
    expect(groups.find((g) => g.label === 'Patients')).toBeUndefined()
  })

  it('patient tenant gets no entity groups (portal has its own surfaces)', async () => {
    state.patients = [{ id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: null, phone: null }]
    const groups = await globalSearch(ctx({ tenantType: 'patient' }), 'mia')
    expect(groups.find((g) => g.label === 'Patients')).toBeUndefined()
  })
})
