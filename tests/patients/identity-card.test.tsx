import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * THE RECORD'S CONTACT CARD (G2-25). The phone is dialled from here and the
 * email is written to from here, so both are LINKS; the number reads the way
 * every other surface shows it; a date of birth reads as a date, not an ISO
 * key; and the two settings a front desk needs at a glance — preferred
 * language, a per-patient recall interval — are neutral pills on the card
 * rather than facts buried in the edit modal.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(default)/patients/actions', () => ({
  archivePatientAction: vi.fn(),
  updatePatientAction: vi.fn(),
  addPatientNoteAction: vi.fn(),
  deletePatientNoteAction: vi.fn(),
  openPatientThreadAction: vi.fn(),
  sendIntakeRequestAction: vi.fn(async () => ({ ok: true, sentTo: 'mia@example.com' })),
  sendReviewRequestForPatientAction: vi.fn(async () => ({ ok: true })),
  sendPatientPortalInviteAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => () => {} }))

import { IdentityCard } from '@/app/(default)/patients/[id]/patient-detail'
import type { PatientHeader } from '@/lib/services/patients'

function header(overrides: Partial<PatientHeader> = {}): PatientHeader {
  return {
    id: 'pat_1',
    firstName: 'Mia',
    lastName: 'Hayes',
    fullName: 'Mia Hayes',
    email: 'mia@example.com',
    phone: '5019824447',
    dateOfBirth: '1985-06-07',
    ageYears: 41,
    addressLine1: '12 Linden Ave',
    city: 'Brooklyn',
    state: 'NY',
    postalCode: '11201',
    insuranceProvider: 'Delta Dental',
    insurancePolicyNumber: null,
    insuranceGroupNumber: null,
    insuranceDetail: null,
    notes: null,
    source: 'booking',
    lifecycle: 'active',
    firstSeenAt: new Date('2025-08-10T00:00:00Z'),
    lastActivityAt: null,
    hasPortalAccount: true,
    guardianPatientId: null,
    mergedIntoPatientId: null,
    recallIntervalMonths: null,
    preferredLanguage: null,
    flags: {
      newPatient: false,
      birthdayThisWeek: false,
      hasOutstandingBalance: false,
      missingIntakeBeforeAppt: false,
      unconfirmedNext48h: false,
      lapsed: false,
      optedOut: false,
    },
    outstandingBalanceCents: null,
    balanceAsOf: null,
    shopSpendCents: 0,
    lastVisitAt: null,
    nextVisitAt: null,
    nextVisitType: null,
    totalBookings: 0,
    ...overrides,
  }
}

afterEach(cleanup)

describe('IdentityCard', () => {
  it('links the phone as tel: and shows it formatted', () => {
    render(<IdentityCard header={header()} />)
    const tel = screen.getByRole('link', { name: '(501) 982-4447' })
    expect(tel).toHaveAttribute('href', 'tel:5019824447')
  })

  it('links the email as mailto:', () => {
    render(<IdentityCard header={header()} />)
    expect(screen.getByRole('link', { name: 'mia@example.com' })).toHaveAttribute('href', 'mailto:mia@example.com')
  })

  it('keeps a number it cannot parse visible (and dialable as typed), never blank', () => {
    render(<IdentityCard header={header({ phone: '+44 20 7946 0958' })} />)
    // formatPhone falls back to the raw string for a non-US number; the link
    // strips to digits and the leading plus so the dialler still gets it.
    const tel = screen.getByRole('link', { name: '+44 20 7946 0958' })
    expect(tel).toHaveAttribute('href', 'tel:+442079460958')
  })

  it('says what is missing rather than printing a dash', () => {
    render(<IdentityCard header={header({ email: null, phone: null })} />)
    expect(screen.getByText('No email on file')).toBeInTheDocument()
    expect(screen.getByText('No phone on file')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('reads the date of birth as a date — "Jun 7, 1985", never the ISO key', () => {
    render(<IdentityCard header={header()} />)
    expect(screen.getByText(/Born Jun 7, 1985/)).toBeInTheDocument()
    expect(screen.queryByText(/1985-06-07/)).not.toBeInTheDocument()
  })

  it('shows preferred language and a per-patient recall interval as neutral pills', () => {
    render(<IdentityCard header={header({ preferredLanguage: 'es', recallIntervalMonths: 4 })} />)
    expect(screen.getByText('Prefers Spanish')).toBeInTheDocument()
    expect(screen.getByText('Recall every 4 months')).toBeInTheDocument()
  })

  it('shows no pills when neither setting is set (the clinic default is not a fact about the patient)', () => {
    render(<IdentityCard header={header({ preferredLanguage: null, recallIntervalMonths: null })} />)
    expect(screen.queryByText(/Prefers/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Recall every/)).not.toBeInTheDocument()
  })

  it('a zero recall override shows no pill — it means the default, not "every 0 months"', () => {
    render(<IdentityCard header={header({ recallIntervalMonths: 0 })} />)
    expect(screen.queryByText(/Recall every/)).not.toBeInTheDocument()
  })
})
