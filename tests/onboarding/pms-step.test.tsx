import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockSelect, mockInsert, mockUpdate, mockTransaction, mockGetReq, mockSubmitReq } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockGetReq: vi.fn(),
  mockSubmitReq: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth/server', () => ({ auth: { api: { getSession: mockGetSession } } }))
vi.mock('@/lib/services/forms', () => ({ seedDefaultIntakeForm: vi.fn(async () => undefined) }))
vi.mock('@/lib/onboarding/defaults', () => ({ seedClinicDay0Defaults: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/starter-pack', () => ({ applyStarterFloor: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/pms-connect', () => ({ getPmsConnectRequest: mockGetReq, submitPmsConnectRequest: mockSubmitReq }))
vi.mock('@/lib/services/prospecting', () => ({ convertProspectForSignup: vi.fn(async () => undefined) }))
vi.mock('@/lib/email', () => ({ sendTrialWelcomeEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/db', () => ({
  db: { select: mockSelect, insert: mockInsert, update: mockUpdate, transaction: mockTransaction },
  schema: {
    organization: { id: 'org.id', slug: 'org.slug' },
    member: { userId: 'member.userId' },
    session: { id: 'session.id' },
    clinicProfile: { organizationId: 'clinic_profile.organizationId' },
  },
}))
vi.mock('@/components/ui/logo', () => ({ default: () => null }))

import { submitOnboarding } from '@/app/(onboarding)/actions'
import Onboarding01 from '@/app/(onboarding)/onboarding-01/page'
import Onboarding02 from '@/app/(onboarding)/onboarding-02/page'
import OnboardingProgress from '@/app/(onboarding)/onboarding-progress'
import { PMS_ANSWER_CHOICES } from '@/lib/onboarding/pms-answer'

const session = {
  user: { id: 'u1', email: 'doc@example.com', name: 'Dr. Jane Lee', platformAdmin: false },
  session: { id: 's1', activeOrganizationId: null },
}

const profiles: Array<Record<string, unknown>> = []
let conflictSet: Record<string, unknown> | null = null

beforeEach(() => {
  vi.clearAllMocks()
  profiles.length = 0
  conflictSet = null
  mockGetSession.mockResolvedValue(session)
  mockGetReq.mockResolvedValue(null)
  mockSelect.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }))
  mockInsert.mockImplementation(() => ({
    values: (v: Record<string, unknown>) => {
      profiles.push(v)
      return {
        onConflictDoUpdate: async (c: { set: Record<string, unknown> }) => {
          conflictSet = c.set
        },
      }
    },
  }))
  mockUpdate.mockImplementation(() => ({ set: () => ({ where: async () => undefined }) }))
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
    cb({ insert: () => ({ values: () => Promise.resolve() }), update: () => ({ set: () => ({ where: () => Promise.resolve() }) }) }),
  )
})

const base = { practiceName: 'Bright Smile Dental', phone: '555', street: '1 Main', city: 'Austin', postalCode: '78701', country: 'US', slug: 'bright-smile' }

describe('the software answer (submitOnboarding)', () => {
  it('a vendor is stored on the profile and files the connect request once, with the owner as the contact', async () => {
    await submitOnboarding({ ...base, pmsAnswer: 'dentrix' })
    expect(profiles[0].pmsAnswer).toBe('dentrix')
    expect(conflictSet).toMatchObject({ pmsAnswer: 'dentrix' })
    expect(mockSubmitReq).toHaveBeenCalledTimes(1)
    expect(mockSubmitReq.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      clinicName: 'Bright Smile Dental',
      input: { vendor: 'dentrix', contactName: 'Dr. Jane Lee', contactEmail: 'doc@example.com', practiceNameInPms: 'Bright Smile Dental' },
    })
  })

  it('never re-files when a request already exists', async () => {
    mockGetReq.mockResolvedValue({ id: 'pmsreq_1' })
    await submitOnboarding({ ...base, pmsAnswer: 'eaglesoft' })
    expect(mockSubmitReq).not.toHaveBeenCalled()
  })

  it('"something else" carries the name the owner typed', async () => {
    await submitOnboarding({ ...base, pmsAnswer: 'other', pmsVendorName: 'ToothTool' })
    expect(mockSubmitReq.mock.calls[0][0].input).toMatchObject({ vendor: 'other', vendorName: 'ToothTool' })
  })

  it.each(['none', 'unsure'])('"%s" is stored as an honest answer and files nothing', async (answer) => {
    await submitOnboarding({ ...base, pmsAnswer: answer })
    expect(profiles[0].pmsAnswer).toBe(answer)
    expect(mockSubmitReq).not.toHaveBeenCalled()
  })

  it('a skip stores null and files nothing; junk is not an answer', async () => {
    await submitOnboarding({ ...base })
    expect(profiles[0].pmsAnswer).toBeNull()
    expect(conflictSet).not.toHaveProperty('pmsAnswer')
    await submitOnboarding({ ...base, pmsAnswer: 'made-up' })
    expect(profiles[1].pmsAnswer).toBeNull()
    expect(mockSubmitReq).not.toHaveBeenCalled()
  })

  it('still starts the no-card trial and writes every identity field (no Stripe import)', async () => {
    await submitOnboarding({ ...base, state: 'TX', brandColor: '#9CAF9F', pmsAnswer: 'dentrix' })
    expect(profiles[0]).toMatchObject({
      displayName: 'Bright Smile Dental',
      phone: '555',
      addressLine1: '1 Main',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      brandColor: '#9CAF9F',
      planTier: 'premium',
      subscriptionStatus: 'trialing',
    })
    const src = readFileSync(join(process.cwd(), 'app/(onboarding)/actions.ts'), 'utf8')
    expect(src).not.toMatch(/from '[^']*stripe[^']*'|import\('[^']*stripe/i)
  })
})

describe('three screens', () => {
  it('the progress reads "N of 3" with a current step', () => {
    render(<OnboardingProgress step={2} />)
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Practice').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('screen 2 holds the practice fields, address included', () => {
    render(<Onboarding01 />)
    for (const l of [/practice name/i, /front-desk phone/i, /street address/i, /^city/i, /zip/i]) {
      expect(screen.getByLabelText(l)).toBeInTheDocument()
    }
  })

  it('screen 3 asks which software, offers None yet / Not sure, a skip, and the no-card trial', () => {
    render(<Onboarding02 />)
    expect(screen.getByText(/which practice software do you use/i)).toBeInTheDocument()
    expect(PMS_ANSWER_CHOICES.map((c) => c.label)).toEqual(expect.arrayContaining(['Dentrix', 'None yet', 'Not sure']))
    for (const c of PMS_ANSWER_CHOICES) expect(screen.getByLabelText(c.label)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip the software question/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/web address/i)).toBeInTheDocument()
    expect(screen.getByText(/no card required/i)).toBeInTheDocument()
  })
})
