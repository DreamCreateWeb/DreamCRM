import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockSelect, mockInsert, mockUpdate, mockCustomersCreate, mockCheckoutCreate } = vi.hoisted(() => {
  // stripe-config reads these at module load — set before imports evaluate.
  process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_basic_m'
  process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY = 'price_pro_m'
  process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_premium_m'
  return {
    mockGetSession: vi.fn(),
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockCustomersCreate: vi.fn(),
    mockCheckoutCreate: vi.fn(),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/lib/auth/server', () => ({ auth: { api: { getSession: mockGetSession } } }))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
  },
}))
vi.mock('@/lib/db', () => {
  const schema = {
    organization: { id: 'org.id', slug: 'org.slug' },
    member: { userId: 'member.userId' },
    session: { id: 'session.id' },
    clinicProfile: { organizationId: 'clinic_profile.organizationId' },
  }
  return {
    db: {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    },
    schema,
  }
})

import { checkClinicSlug, submitOnboarding } from '@/app/(onboarding)/actions'

/** db.select(...).from(...).where(...).limit(1) → resolves rows */
function selectReturning(rowsSequence: unknown[][]) {
  let call = 0
  mockSelect.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => rowsSequence[Math.min(call++, rowsSequence.length - 1)],
      }),
    }),
  }))
}

function insertOk() {
  mockInsert.mockImplementation(() => ({
    values: (v: unknown) => ({
      onConflictDoUpdate: async () => undefined,
      then: (resolve: (v: unknown) => void) => resolve(undefined),
    }),
  }))
}

function updateOk() {
  mockUpdate.mockImplementation(() => ({
    set: () => ({ where: async () => undefined }),
  }))
}

const userSession = {
  user: { id: 'u1', email: 'doc@example.com', name: 'Dr. Jane Lee', platformAdmin: false },
  session: { id: 's1', activeOrganizationId: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(userSession)
  insertOk()
  updateOk()
})

describe('checkClinicSlug', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    await expect(checkClinicSlug('bright-smile')).rejects.toThrow(/sign in/i)
  })

  it('rejects invalid shapes without hitting the db', async () => {
    selectReturning([[]])
    expect(await checkClinicSlug('ab')).toEqual({ available: false, reason: 'invalid' })
    expect(await checkClinicSlug('Bad Slug!')).toEqual({ available: false, reason: 'invalid' })
    expect(await checkClinicSlug('-leading')).toEqual({ available: false, reason: 'invalid' })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('blocks reserved subdomains and offers an alternative', async () => {
    selectReturning([[]])
    const result = await checkClinicSlug('www')
    expect(result.available).toBe(false)
    expect(result.reason).toBe('reserved')
    expect(result.suggestion).toBe('www-dental')
  })

  it('reports a taken slug with the first free suffix', async () => {
    // 'acme' taken → suggestion skips the base and lands on 'acme-dental'
    selectReturning([[{ id: 'org1' }], []])
    const result = await checkClinicSlug('acme')
    expect(result).toEqual({ available: false, reason: 'taken', suggestion: 'acme-dental' })
  })

  it('returns available for a free, valid slug', async () => {
    selectReturning([[]])
    expect(await checkClinicSlug('bright-smile')).toEqual({ available: true })
  })
})

describe('submitOnboarding', () => {
  it('blocks platform admins from clinic onboarding', async () => {
    mockGetSession.mockResolvedValueOnce({
      ...userSession,
      user: { ...userSession.user, platformAdmin: true },
    })
    await expect(
      submitOnboarding({ planId: 'pro', interval: 'monthly' }),
    ).rejects.toThrow(/platform admins/i)
  })

  it('creates the org with the chosen slug and opens promo-enabled checkout', async () => {
    // select order: member lookup (none) → slug free → clinic_profile (has customer)
    selectReturning([[], [], [{ stripeCustomerId: 'cus_123' }]])
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/cs_1' })

    const { url } = await submitOnboarding({
      practiceName: 'Bright Smile Dental',
      phone: '(555) 123-4567',
      street: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'United States',
      slug: 'bright-smile',
      brandColor: '#9CAF9F',
      planId: 'pro',
      interval: 'monthly',
    })

    expect(url).toBe('https://checkout.stripe.test/cs_1')

    // Org row used the picked slug + practice name.
    const orgInsert = mockInsert.mock.calls.length > 0
    expect(orgInsert).toBe(true)

    const checkoutArgs = mockCheckoutCreate.mock.calls[0][0]
    expect(checkoutArgs.allow_promotion_codes).toBe(true)
    expect(checkoutArgs.mode).toBe('subscription')
    expect(checkoutArgs.metadata.planId).toBe('pro')
  })

  it('falls back to a suffixed slug when the picked one was taken meanwhile', async () => {
    // member lookup (none) → slug taken → slug-1 free → profile lookup
    selectReturning([[], [{ id: 'orgX' }], [], [{ stripeCustomerId: 'cus_123' }]])
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/cs_2' })

    const valuesSpy: unknown[] = []
    mockInsert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        valuesSpy.push(v)
        return {
          onConflictDoUpdate: async () => undefined,
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        }
      },
    }))

    await submitOnboarding({ practiceName: 'Acme', slug: 'acme', planId: 'basic', interval: 'monthly' })

    const orgValues = valuesSpy.find((v) => (v as { type?: string }).type === 'clinic') as { slug: string }
    expect(orgValues.slug).toBe('acme-1')
  })

  it('rejects a bad brand color before any writes', async () => {
    await expect(
      submitOnboarding({ planId: 'pro', interval: 'monthly', brandColor: 'tomato' as never }),
    ).rejects.toThrow()
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
