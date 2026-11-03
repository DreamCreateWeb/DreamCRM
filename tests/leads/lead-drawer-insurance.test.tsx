import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { LeadRow } from '@/lib/services/leads'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(default)/leads/actions', () => ({
  markLeadContactedAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  reopenLeadAction: vi.fn(),
  convertLeadAction: vi.fn(),
  previewLeadConvertAction: vi.fn(async () => ({ ok: true, matchedPatientName: null })),
}))

import LeadDrawer, { insuranceCheckHref } from '@/app/(default)/leads/lead-drawer'

function makeRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'lead_1',
    name: 'Olivia Chen',
    email: 'olivia@example.com',
    phone: '(415) 555-0188',
    preferredDate: null,
    message: 'Carrier: Delta Dental\nInsurance verification request.',
    sourcePage: 'insurance_verifier',
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    status: 'new',
    convertedToPatientId: null,
    convertedPatientName: null,
    contactedAt: null,
    convertedAt: null,
    archivedAt: null,
    archivedReason: null,
    createdAt: new Date(),
    ageHours: 0,
    ...overrides,
  }
}

beforeEach(() => cleanup())

function open(row: LeadRow, insuranceOpen?: boolean) {
  render(<LeadDrawer timeZone="America/Chicago" row={row} onClose={() => {}} onStatusChange={() => {}} insuranceOpen={insuranceOpen} />)
}

describe('LeadDrawer — Check their insurance', () => {
  it('shows the door only with the insurance switch on, carrying the carrier, name and email', () => {
    open(makeRow(), true)
    const link = screen.getByText('Check their insurance →').closest('a')
    expect(link?.getAttribute('href')).toBe('/insurance?payer=Delta+Dental&name=Olivia+Chen&email=olivia%40example.com')
  })
  it('is absent while the switch is off, and for leads that are not insurance questions', () => {
    open(makeRow(), false)
    expect(screen.queryByText('Check their insurance →')).toBeNull()
    cleanup()
    open(makeRow({ sourcePage: '/' }), true)
    expect(screen.queryByText('Check their insurance →')).toBeNull()
  })
  it('leaves out the sentinel name the carrier-only form writes', () => {
    expect(insuranceCheckHref({ message: 'Carrier: Cigna\nx', name: 'Insurance verification request', email: null })).toBe('/insurance?payer=Cigna')
  })
})
