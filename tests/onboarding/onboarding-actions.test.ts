import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockSelect, mockInsert, mockUpdate, mockTransaction, mockSeedIntake, mockSeedDay0, mockStarterFloor } =
  vi.hoisted(() => {
    return {
      mockSeedIntake: vi.fn(async () => undefined),
      mockSeedDay0: vi.fn(async () => undefined),
      mockStarterFloor: vi.fn(async () => ({ applied: true, fields: [] })),
      mockGetSession: vi.fn(),
      mockSelect: vi.fn(),
      mockInsert: vi.fn(),
      mockUpdate: vi.fn(),
      mockTransaction: vi.fn(),
    }
  })

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/lib/auth/server', () => ({ auth: { api: { getSession: mockGetSession } } }))
vi.mock('@/lib/services/forms', () => ({ seedDefaultIntakeForm: mockSeedIntake }))
vi.mock('@/lib/onboarding/defaults', () => ({ seedClinicDay0Defaults: mockSeedDay0 }))
vi.mock('@/lib/services/starter-pack', () => ({ applyStarterFloor: mockStarterFloor }))
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
      transaction: mockTransaction,
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

/** Captures every inserted row (tx org/member + db clinic_profile) into `sink`. */
function captureInserts(sink: Record<string, unknown>[]) {
  // db.insert → clinic_profile upsert
  mockInsert.mockImplementation(() => ({
    values: (v: Record<string, unknown>) => {
      sink.push(v)
      return { onConflictDoUpdate: async () => undefined }
    },
  }))
  mockUpdate.mockImplementation(() => ({ set: () => ({ where: async () => undefined }) }))
  // db.transaction(cb) → runs cb with a tx exposing insert/update (org + member +
  // session pointer), atomically in the real code.
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          sink.push(v)
          return Promise.resolve()
        },
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    }
    await cb(tx)
  })
}

const userSession = {
  user: { id: 'u1', email: 'doc@example.com', name: 'Dr. Jane Lee', platformAdmin: false },
  session: { id: 's1', activeOrganizationId: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(userSession)
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
    selectReturning([[{ id: 'org1' }], []])
    const result = await checkClinicSlug('acme')
    expect(result).toEqual({ available: false, reason: 'taken', suggestion: 'acme-dental' })
  })

  it('returns available for a free, valid slug', async () => {
    selectReturning([[]])
    expect(await checkClinicSlug('bright-smile')).toEqual({ available: true })
  })
})

describe('submitOnboarding — starts a no-card trial (no Stripe)', () => {
  it('blocks platform admins from clinic onboarding', async () => {
    mockGetSession.mockResolvedValueOnce({
      ...userSession,
      user: { ...userSession.user, platformAdmin: true },
    })
    await expect(submitOnboarding({})).rejects.toThrow(/platform admins/i)
  })

  it('creates the org + grants a full-Premium 7-day trial, no checkout', async () => {
    // selects: member lookup (none) → slug free
    selectReturning([[], []])
    const inserts: Record<string, unknown>[] = []
    captureInserts(inserts)

    const before = Date.now()
    const result = await submitOnboarding({
      practiceName: 'Bright Smile Dental',
      phone: '(555) 123-4567',
      street: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'United States',
      slug: 'bright-smile',
      brandColor: '#9CAF9F',
    })

    expect(result).toEqual({ ok: true })

    // Org row used the picked slug + practice name (inserted inside the tx).
    const org = inserts.find((v) => v.type === 'clinic') as { slug: string; name: string }
    expect(org.slug).toBe('bright-smile')
    expect(org.name).toBe('Bright Smile Dental')

    // clinic_profile starts the trial: full Premium, trialing, trial_ends_at ~7d out.
    const profile = inserts.find((v) => v.planTier !== undefined) as {
      planTier: string
      subscriptionStatus: string
      billingMode: string
      trialEndsAt: Date
    }
    expect(profile.planTier).toBe('premium')
    expect(profile.subscriptionStatus).toBe('trialing')
    expect(profile.billingMode).toBe('self_serve')
    expect(profile.trialEndsAt).toBeInstanceOf(Date)
    const days = (profile.trialEndsAt.getTime() - before) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)

    // Day-0 seeding still runs.
    expect(mockSeedIntake).toHaveBeenCalledTimes(1)
    expect(mockStarterFloor).toHaveBeenCalledTimes(1)
    expect(mockStarterFloor).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ displayName: 'Bright Smile Dental', city: 'Austin', state: 'TX' }),
    )
  })

  it('applies the floor even with no address (city left null)', async () => {
    selectReturning([[], []])
    captureInserts([])

    await submitOnboarding({ practiceName: 'No Address Dental' })

    expect(mockStarterFloor).toHaveBeenCalledTimes(1)
    expect(mockStarterFloor).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ displayName: 'No Address Dental', city: null }),
    )
  })

  it('falls back to a suffixed slug when the picked one was taken meanwhile', async () => {
    // member lookup (none) → slug 'acme' taken → 'acme-1' free
    selectReturning([[], [{ id: 'orgX' }], []])
    const inserts: Record<string, unknown>[] = []
    captureInserts(inserts)

    await submitOnboarding({ practiceName: 'Acme', slug: 'acme' })

    const org = inserts.find((v) => v.type === 'clinic') as { slug: string }
    expect(org.slug).toBe('acme-1')
  })

  it('rejects a bad brand color before any writes', async () => {
    await expect(submitOnboarding({ brandColor: 'tomato' as never })).rejects.toThrow()
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
