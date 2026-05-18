import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbState: { selectQueue: unknown[][] } = { selectQueue: [] }

const stripeStubs: {
  invoices: Array<{
    id?: string
    number?: string | null
    status?: string
    amount_paid: number
    amount_due: number
    created: number
  }>
  throwOn: null | 'list'
} = {
  invoices: [],
  throwOn: null,
}

vi.mock('@/lib/stripe', () => ({
  stripe: {
    invoices: {
      list: vi.fn(async () => {
        if (stripeStubs.throwOn === 'list') {
          throw new Error('STRIPE_SECRET_KEY is not set')
        }
        return { data: stripeStubs.invoices }
      }),
    },
  },
}))

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.groupBy = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => dbState.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(dbState.selectQueue.shift() ?? [])
    return obj
  }
  return { db: { select: () => chain() } }
})

import { listClinics, getClinicDetail } from '@/lib/services/clinics'

beforeEach(() => {
  dbState.selectQueue.length = 0
  stripeStubs.invoices = []
  stripeStubs.throwOn = null
})

describe('listClinics', () => {
  it('returns [] when there are no clinic orgs', async () => {
    dbState.selectQueue.push([]) // org list
    const out = await listClinics()
    expect(out).toEqual([])
  })

  it('joins members, patients, and projects per clinic with MRR math', async () => {
    const orgA = {
      orgId: 'org_a',
      name: 'Acme Dental',
      slug: 'acme',
      createdAt: new Date('2026-01-15'),
      displayName: 'Acme',
      logoUrl: null,
      brandColor: '#ff0000',
      email: 'hi@acme.com',
      phone: '555-0001',
      city: 'Austin',
      state: 'TX',
      tagline: 'Bright smiles',
      about: 'About us',
      planTier: 'pro',
      subscriptionStatus: 'active',
      stripeCustomerId: 'cus_a',
      stripeSubscriptionId: 'sub_a',
    }
    const orgB = {
      orgId: 'org_b',
      name: 'Bright Dental',
      slug: 'bright',
      createdAt: new Date('2026-02-20'),
      displayName: null,
      logoUrl: null,
      brandColor: null,
      email: null,
      phone: null,
      city: null,
      state: null,
      tagline: null,
      about: null,
      planTier: 'basic',
      subscriptionStatus: 'canceled',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    }
    dbState.selectQueue.push([orgA, orgB])
    // Member counts
    dbState.selectQueue.push([
      { orgId: 'org_a', count: 3 },
      { orgId: 'org_b', count: 1 },
    ])
    // Patient counts
    dbState.selectQueue.push([{ orgId: 'org_a', count: 42 }])
    // Active project counts
    dbState.selectQueue.push([{ orgId: 'org_a', count: 2 }])

    const out = await listClinics()
    expect(out).toHaveLength(2)
    const a = out.find((c) => c.orgId === 'org_a')!
    const b = out.find((c) => c.orgId === 'org_b')!
    expect(a.monthlyContributionCents).toBe(14_900) // pro × active
    expect(a.memberCount).toBe(3)
    expect(a.patientCount).toBe(42)
    expect(a.activeProjectCount).toBe(2)
    expect(a.hasWebsiteContent).toBe(true)
    expect(b.monthlyContributionCents).toBe(0) // canceled doesn't contribute
    expect(b.memberCount).toBe(1)
    expect(b.patientCount).toBe(0)
    expect(b.hasWebsiteContent).toBe(false)
  })

  it('counts trialing subscriptions toward MRR', async () => {
    dbState.selectQueue.push([
      {
        orgId: 'org_t',
        name: 'Trial Clinic',
        slug: 'trial',
        createdAt: new Date(),
        displayName: null,
        logoUrl: null,
        brandColor: null,
        email: null,
        phone: null,
        city: null,
        state: null,
        tagline: null,
        about: null,
        planTier: 'premium',
        subscriptionStatus: 'trialing',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    ])
    dbState.selectQueue.push([])
    dbState.selectQueue.push([])
    dbState.selectQueue.push([])
    const out = await listClinics()
    expect(out[0].monthlyContributionCents).toBe(19_900) // premium
  })

  it('defaults plan_tier to basic when null', async () => {
    dbState.selectQueue.push([
      {
        orgId: 'org_x',
        name: 'X',
        slug: 'x',
        createdAt: new Date(),
        displayName: null,
        logoUrl: null,
        brandColor: null,
        email: null,
        phone: null,
        city: null,
        state: null,
        tagline: null,
        about: null,
        planTier: null,
        subscriptionStatus: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    ])
    dbState.selectQueue.push([])
    dbState.selectQueue.push([])
    dbState.selectQueue.push([])
    const out = await listClinics()
    expect(out[0].planTier).toBe('basic')
    expect(out[0].monthlyContributionCents).toBe(9_900)
  })

  it('returns [] when the table is missing', async () => {
    const { db } = await import('@/lib/db')
    const orig = db.select
    ;(db as { select: () => unknown }).select = () => {
      throw Object.assign(new Error('relation "organization" does not exist'), {
        code: '42P01',
      })
    }
    try {
      const out = await listClinics()
      expect(out).toEqual([])
    } finally {
      ;(db as { select: unknown }).select = orig
    }
  })
})

describe('getClinicDetail', () => {
  it('returns null when org does not exist or is not a clinic', async () => {
    dbState.selectQueue.push([])
    const out = await getClinicDetail('org_missing')
    expect(out).toBeNull()
  })

  it('aggregates members, projects, patients, invoices, and lifetime totals', async () => {
    // org
    dbState.selectQueue.push([
      { id: 'org_a', name: 'Acme', slug: 'acme', type: 'clinic', createdAt: new Date('2026-01-01') },
    ])
    // profile
    dbState.selectQueue.push([
      {
        organizationId: 'org_a',
        displayName: 'Acme Dental',
        brandColor: '#000',
        planTier: 'pro',
        subscriptionStatus: 'active',
        stripeCustomerId: 'cus_a',
        stripeSubscriptionId: 'sub_a',
        tagline: 't',
        about: null,
        addressLine1: null,
        addressLine2: null,
        city: 'Austin',
        state: 'TX',
        postalCode: null,
        country: 'US',
        legalName: null,
        npi: null,
        template: 'modern',
        phone: null,
        email: null,
        websiteDomain: null,
        hours: null,
        logoUrl: null,
        heroImageUrl: null,
        services: null,
        staff: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    // members
    dbState.selectQueue.push([
      {
        userId: 'u_1',
        role: 'owner',
        joinedAt: new Date(),
        email: 'owner@acme.com',
        name: 'Owner',
      },
      {
        userId: 'u_2',
        role: 'patient',
        joinedAt: new Date(),
        email: 'pat@x.com',
        name: 'Patient',
      },
    ])
    // patient count
    dbState.selectQueue.push([{ count: 5 }])
    // upcoming appointment count
    dbState.selectQueue.push([{ count: 2 }])
    // projects
    dbState.selectQueue.push([
      {
        id: 'p_1',
        title: 'Brand video',
        type: 'videography',
        status: 'completed',
        budgetCents: 250_000,
        dueDate: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'p_2',
        title: 'Intake form',
        type: 'intake_form',
        status: 'in_progress',
        budgetCents: 100_000,
        dueDate: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    ])
    // Stripe invoices
    stripeStubs.invoices = [
      { id: 'inv_1', number: 'A-001', status: 'paid', amount_paid: 14_900, amount_due: 14_900, created: 1_700_000_000 },
      { id: 'inv_2', number: 'A-002', status: 'paid', amount_paid: 14_900, amount_due: 14_900, created: 1_700_500_000 },
    ]

    const d = await getClinicDetail('org_a')
    expect(d).not.toBeNull()
    expect(d!.members).toHaveLength(2)
    expect(d!.patientCount).toBe(5)
    expect(d!.upcomingAppointmentCount).toBe(2)
    expect(d!.projects).toHaveLength(2)
    expect(d!.lifetimeProjectCents).toBe(250_000) // only completed counted
    expect(d!.lifetimeSubscriptionCents).toBe(29_800)
    expect(d!.invoices).toHaveLength(2)
    expect(d!.invoices[0].paid).toBe(true)
    expect(d!.stripeUnavailable).toBe(false)
  })

  it('flags stripeUnavailable but still returns DB data', async () => {
    dbState.selectQueue.push([
      { id: 'org_a', name: 'Acme', slug: 'acme', type: 'clinic', createdAt: new Date() },
    ])
    dbState.selectQueue.push([
      {
        organizationId: 'org_a',
        stripeCustomerId: 'cus_a',
        planTier: 'pro',
        subscriptionStatus: 'active',
        displayName: null,
        brandColor: null,
        legalName: null,
        npi: null,
        template: 'modern',
        phone: null,
        email: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        country: 'US',
        tagline: null,
        about: null,
        websiteDomain: null,
        hours: null,
        logoUrl: null,
        heroImageUrl: null,
        services: null,
        staff: null,
        stripeSubscriptionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    dbState.selectQueue.push([]) // members
    dbState.selectQueue.push([{ count: 0 }]) // patient count
    dbState.selectQueue.push([{ count: 0 }]) // upcoming count
    dbState.selectQueue.push([]) // projects
    stripeStubs.throwOn = 'list'

    const d = await getClinicDetail('org_a')
    expect(d!.stripeUnavailable).toBe(true)
    expect(d!.invoices).toEqual([])
    expect(d!.lifetimeSubscriptionCents).toBe(0)
  })

  it('skips Stripe call when no customer is linked', async () => {
    dbState.selectQueue.push([
      { id: 'org_a', name: 'Acme', slug: 'acme', type: 'clinic', createdAt: new Date() },
    ])
    dbState.selectQueue.push([
      {
        organizationId: 'org_a',
        stripeCustomerId: null,
        planTier: 'basic',
        subscriptionStatus: null,
        displayName: null,
        brandColor: null,
        legalName: null,
        npi: null,
        template: 'modern',
        phone: null,
        email: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        country: 'US',
        tagline: null,
        about: null,
        websiteDomain: null,
        hours: null,
        logoUrl: null,
        heroImageUrl: null,
        services: null,
        staff: null,
        stripeSubscriptionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    dbState.selectQueue.push([]) // members
    dbState.selectQueue.push([{ count: 0 }])
    dbState.selectQueue.push([{ count: 0 }])
    dbState.selectQueue.push([])
    const d = await getClinicDetail('org_a')
    expect(d!.invoices).toEqual([])
    expect(d!.stripeUnavailable).toBe(false)
  })
})
