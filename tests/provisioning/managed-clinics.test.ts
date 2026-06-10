import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSelect,
  mockInsert,
  mockUpdate,
  mockCouponsCreate,
  mockCouponsRetrieve,
  mockCustomersCreate,
  mockCheckoutCreate,
  mockSendInvitationEmail,
} = vi.hoisted(() => {
  process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_basic_m'
  process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY = 'price_pro_m'
  process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_premium_m'
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.dreamcreatestudio.com'
  return {
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockCouponsCreate: vi.fn(),
    mockCouponsRetrieve: vi.fn(),
    mockCustomersCreate: vi.fn(),
    mockCheckoutCreate: vi.fn(),
    mockSendInvitationEmail: vi.fn(),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ sendInvitationEmail: mockSendInvitationEmail }))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    coupons: { create: mockCouponsCreate, retrieve: mockCouponsRetrieve },
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
  },
}))
vi.mock('@/lib/db', () => {
  const schema = {
    organization: { id: 'org.id', slug: 'org.slug', name: 'org.name' },
    clinicProfile: { organizationId: 'cp.orgId' },
    invitation: { id: 'inv.id', organizationId: 'inv.orgId', status: 'inv.status' },
  }
  return { db: { select: mockSelect, insert: mockInsert, update: mockUpdate }, schema }
})

import {
  createActivationCheckout,
  createManagedClinic,
  getActivationDetails,
  resendClinicOwnerInvite,
} from '@/lib/services/clinic-provisioning'

const inserted: Array<Record<string, unknown>> = []

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

beforeEach(() => {
  vi.clearAllMocks()
  inserted.length = 0
  mockInsert.mockImplementation(() => ({
    values: (v: Record<string, unknown>) => {
      inserted.push(v)
      return Promise.resolve(undefined)
    },
  }))
  mockUpdate.mockImplementation(() => ({ set: () => ({ where: async () => undefined }) }))
  mockSendInvitationEmail.mockResolvedValue(undefined)
})

const baseInput = {
  name: 'Bright Smile Dental',
  ownerEmail: 'jane@brightsmile.com',
  ownerName: 'Dr. Jane Lee',
  planId: 'pro' as const,
  interval: 'monthly' as const,
  note: 'Closed by Dustin at the dental expo',
  inviterUserId: 'admin-1',
  inviterName: 'Dustin',
}

describe('createManagedClinic', () => {
  it('comped: grants the tier immediately, creates no coupon, invites the owner', async () => {
    selectReturning([[]]) // slug free
    const result = await createManagedClinic({ ...baseInput, pricing: { kind: 'comped' } })

    expect(mockCouponsCreate).not.toHaveBeenCalled()
    expect(result.couponId).toBeNull()

    const profile = inserted.find((v) => 'planTier' in v)!
    expect(profile.planTier).toBe('pro')
    expect(profile.billingMode).toBe('comped')
    expect(profile.pendingPlanId).toBeNull()
    expect(profile.managedNote).toBe('Closed by Dustin at the dental expo')

    const invite = inserted.find((v) => 'inviterId' in v)!
    expect(invite.email).toBe('jane@brightsmile.com')
    expect(invite.role).toBe('owner')
    expect(invite.status).toBe('pending')

    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      'jane@brightsmile.com',
      expect.objectContaining({
        orgName: 'Bright Smile Dental',
        inviteUrl: expect.stringContaining(`/accept-invite?token=${result.invitationId}`),
      }),
    )
  })

  it('managed + percent off forever: creates the coupon, stays on basic with the plan reserved', async () => {
    selectReturning([[]])
    mockCouponsCreate.mockResolvedValue({ id: 'coup_1' })

    const result = await createManagedClinic({
      ...baseInput,
      pricing: { kind: 'percent_off', percentOff: 30 },
    })

    expect(mockCouponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ percent_off: 30, duration: 'forever' }),
    )
    expect(result.couponId).toBe('coup_1')

    const profile = inserted.find((v) => 'planTier' in v)!
    expect(profile.planTier).toBe('basic') // webhook grants it after payment
    expect(profile.billingMode).toBe('managed')
    expect(profile.pendingPlanId).toBe('pro')
    expect(profile.pendingBillingInterval).toBe('monthly')
    expect(profile.stripeCouponId).toBe('coup_1')
  })

  it('maps dollar discounts with month spans onto Stripe repeating coupons', async () => {
    selectReturning([[]])
    mockCouponsCreate.mockResolvedValue({ id: 'coup_2' })
    await createManagedClinic({
      ...baseInput,
      pricing: { kind: 'amount_off', amountOffCents: 5000, durationMonths: 12 },
    })
    expect(mockCouponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 5000,
        currency: 'usd',
        duration: 'repeating',
        duration_in_months: 12,
      }),
    )
  })

  it('one-month discounts become duration=once', async () => {
    selectReturning([[]])
    mockCouponsCreate.mockResolvedValue({ id: 'coup_3' })
    await createManagedClinic({
      ...baseInput,
      pricing: { kind: 'percent_off', percentOff: 50, durationMonths: 1 },
    })
    expect(mockCouponsCreate).toHaveBeenCalledWith(expect.objectContaining({ duration: 'once' }))
  })

  it('suffixes the slug when taken and refuses junk input', async () => {
    selectReturning([[{ id: 'other' }], []]) // bright-smile-dental taken → -1 free
    const result = await createManagedClinic({ ...baseInput, pricing: { kind: 'standard' } })
    const org = inserted.find((v) => v.type === 'clinic')!
    expect(org.slug).toBe('bright-smile-dental-1')
    expect(result.slug).toBe('bright-smile-dental-1')

    await expect(
      createManagedClinic({ ...baseInput, ownerEmail: 'not-an-email', pricing: { kind: 'standard' } }),
    ).rejects.toThrow(/valid owner email/i)
    await expect(
      createManagedClinic({ ...baseInput, pricing: { kind: 'percent_off', percentOff: 0 } }),
    ).rejects.toThrow(/percent/i)
  })
})

describe('createActivationCheckout', () => {
  const managedProfile = {
    billingMode: 'managed',
    pendingPlanId: 'pro',
    pendingBillingInterval: 'monthly',
    stripeCouponId: 'coup_1',
    stripeCustomerId: 'cus_1',
    displayName: 'Bright Smile Dental',
    subscriptionStatus: null,
  }

  it('pre-applies the negotiated coupon (no code typing)', async () => {
    selectReturning([[managedProfile]])
    mockCouponsRetrieve.mockResolvedValue({ id: 'coup_1', valid: true })
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout/cs_1' })

    const { url } = await createActivationCheckout({ organizationId: 'org1', userId: 'u1', email: 'j@x.com' })
    expect(url).toBe('https://checkout/cs_1')
    const args = mockCheckoutCreate.mock.calls[0][0]
    expect(args.discounts).toEqual([{ coupon: 'coup_1' }])
    expect(args.allow_promotion_codes).toBeUndefined()
    expect(args.line_items[0].price).toBe('price_pro_m')
  })

  it('falls back to promo-code entry when the coupon was deleted in Stripe', async () => {
    selectReturning([[managedProfile]])
    mockCouponsRetrieve.mockRejectedValue(new Error('No such coupon'))
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout/cs_2' })

    await createActivationCheckout({ organizationId: 'org1', userId: 'u1', email: 'j@x.com' })
    const args = mockCheckoutCreate.mock.calls[0][0]
    expect(args.discounts).toBeUndefined()
    expect(args.allow_promotion_codes).toBe(true)
  })

  it('returns null for clinics that are not managed-pending', async () => {
    selectReturning([[{ ...managedProfile, billingMode: 'self_serve' }]])
    expect(await createActivationCheckout({ organizationId: 'org1', userId: 'u1', email: 'j@x.com' })).toEqual({
      url: null,
    })
    expect(mockCheckoutCreate).not.toHaveBeenCalled()
  })
})

describe('getActivationDetails', () => {
  it('computes the discounted price for the banner page', async () => {
    selectReturning([
      [
        {
          billingMode: 'managed',
          pendingPlanId: 'pro',
          pendingBillingInterval: 'monthly',
          stripeCouponId: 'coup_1',
          subscriptionStatus: null,
        },
      ],
    ])
    mockCouponsRetrieve.mockResolvedValue({ percent_off: 30, duration: 'forever' })

    const details = await getActivationDetails('org1')
    expect(details).toMatchObject({
      planName: 'Pro',
      basePrice: 149,
      discountedPrice: 104.3,
    })
    expect(details!.discountLabel).toMatch(/30% off/)
  })

  it('returns null once the subscription is active', async () => {
    selectReturning([
      [{ billingMode: 'managed', pendingPlanId: 'pro', subscriptionStatus: 'active' }],
    ])
    expect(await getActivationDetails('org1')).toBeNull()
  })
})

describe('resendClinicOwnerInvite', () => {
  it('re-arms expiry and re-sends the email', async () => {
    selectReturning([
      [{ id: 'inv1', email: 'jane@brightsmile.com', role: 'owner' }],
      [{ name: 'Bright Smile Dental' }],
    ])
    const result = await resendClinicOwnerInvite({ organizationId: 'org1', inviterName: 'Dustin' })
    expect(result.email).toBe('jane@brightsmile.com')
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      'jane@brightsmile.com',
      expect.objectContaining({ inviteUrl: expect.stringContaining('token=inv1') }),
    )
  })

  it('throws when there is no pending invite', async () => {
    selectReturning([[]])
    await expect(resendClinicOwnerInvite({ organizationId: 'org1', inviterName: 'D' })).rejects.toThrow(
      /no pending invitation/i,
    )
  })
})
