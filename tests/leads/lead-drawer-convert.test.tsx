/**
 * CONVERT AND BOOK ARE ONE HOP. After a successful convert the lead drawer
 * stays open in a success state — "Created/Linked <name>" — with "Book them
 * now" (the booking form, mounted right here on the leads page, seeded on
 * the inquiry's preferred date when it parses) and "Open patient". It used
 * to push to /patients/<id> and leave the date for someone to re-type. An
 * already-converted inquiry gets a "Book a visit" secondary for the same
 * reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { LeadRow } from '@/lib/services/leads'

const { push, previewLeadConvertAction, convertLeadAction } = vi.hoisted(() => ({
  push: vi.fn(),
  previewLeadConvertAction: vi.fn(),
  convertLeadAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/app/(default)/leads/actions', () => ({
  markLeadContactedAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  reopenLeadAction: vi.fn(),
  convertLeadAction: (id: string, opts: unknown) => convertLeadAction(id, opts),
  previewLeadConvertAction: (id: string) => previewLeadConvertAction(id),
  getSentInquiryReplyAction: vi.fn(async () => ({ ok: true, reply: null })),
}))
// The booking form as a sentinel that prints what it was seeded with.
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({
  default: ({ patientId, patientName, defaultDate, onClose }: { patientId: string; patientName: string; defaultDate?: string | null; onClose: () => void }) => (
    <div data-testid="booking-form">
      book:{patientId}:{patientName}:{defaultDate ?? '-'}
      <button onClick={onClose}>close-booking</button>
    </div>
  ),
}))

import LeadDrawer from '@/app/(default)/leads/lead-drawer'

function makeRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'lead_1',
    name: 'Olivia Chen',
    email: 'olivia@example.com',
    phone: '(415) 555-0188',
    preferredDate: null,
    message: null,
    sourcePage: '/',
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    status: 'contacted',
    convertedToPatientId: null,
    convertedPatientName: null,
    contactedAt: null,
    convertedAt: null,
    archivedAt: null,
    archivedReason: null,
    createdAt: new Date(),
    ageHours: 5,
    ...overrides,
  }
}

function renderDrawer(row: LeadRow) {
  return render(<LeadDrawer timeZone="America/Chicago" row={row} onClose={() => {}} onStatusChange={() => {}} />)
}

async function convert() {
  fireEvent.click(screen.getByRole('button', { name: 'Convert to patient' }))
  await waitFor(() => expect(convertLeadAction).toHaveBeenCalledWith('lead_1', { forceNewPatient: false }))
}

beforeEach(() => {
  push.mockReset()
  previewLeadConvertAction.mockReset().mockResolvedValue({ ok: true, matchedPatientName: null })
  convertLeadAction.mockReset().mockResolvedValue({ ok: true, patientId: 'pat_9', patientName: 'Olivia Chen', deduped: false })
})

describe('LeadDrawer — convert stays open with the two doors', () => {
  it('shows the success state with "Book them now" + "Open patient", and does not navigate away', async () => {
    renderDrawer(makeRow())
    await convert()
    // The toast says the same sentence — read the BLOCK (the one with a tone).
    const book = await screen.findByRole('button', { name: 'Book them now' })
    const block = book.closest('[data-tone]')
    expect(block?.getAttribute('data-tone')).toBe('ok')
    expect(block).toHaveTextContent(/Created patient Olivia Chen\./)
    expect(screen.getByRole('link', { name: 'Open patient' })).toHaveAttribute('href', '/patients/pat_9')
    // The old ladder's Convert is gone from under the state.
    expect(screen.queryByRole('button', { name: 'Convert to patient' })).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it('says "Linked" for a dedupe link', async () => {
    convertLeadAction.mockResolvedValue({ ok: true, patientId: 'pat_3', patientName: 'Olivia Chen', deduped: true })
    renderDrawer(makeRow())
    await convert()
    const book = await screen.findByRole('button', { name: 'Book them now' })
    expect(book.closest('[data-tone]')).toHaveTextContent(/Linked to existing patient Olivia Chen\./)
    expect(screen.getByRole('link', { name: 'Open patient' })).toHaveAttribute('href', '/patients/pat_3')
  })

  it('"Book them now" opens the booking form on the new patient, seeded from a parseable preferred date', async () => {
    renderDrawer(makeRow({ preferredDate: '11/03/2099' }))
    await convert()
    expect(await screen.findByText(/They asked for 11\/03\/2099/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Book them now' }))
    expect(screen.getByTestId('booking-form').textContent).toContain('book:pat_9:Olivia Chen:2099-11-03')
    fireEvent.click(screen.getByText('close-booking'))
    expect(screen.queryByTestId('booking-form')).toBeNull()
    // The success state is still there to book again or open the record.
    expect(screen.getByRole('button', { name: 'Book them now' })).toBeTruthy()
  })

  it('an unparseable preferred date seeds nothing', async () => {
    renderDrawer(makeRow({ preferredDate: 'next tuesday' }))
    await convert()
    await screen.findByRole('button', { name: 'Book them now' })
    expect(screen.queryByText(/They asked for/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Book them now' }))
    expect(screen.getByTestId('booking-form').textContent).toContain('book:pat_9:Olivia Chen:-')
  })

  it('a preferred date already gone seeds nothing either', async () => {
    renderDrawer(makeRow({ preferredDate: '01/02/2000' }))
    await convert()
    await screen.findByRole('button', { name: 'Book them now' })
    fireEvent.click(screen.getByRole('button', { name: 'Book them now' }))
    expect(screen.getByTestId('booking-form').textContent).toContain(':-')
  })

  it('a refused convert shows the error and no success state', async () => {
    convertLeadAction.mockResolvedValue({ ok: false, error: 'Inquiry not found' })
    renderDrawer(makeRow())
    await convert()
    expect(await screen.findByText('Inquiry not found')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Book them now' })).toBeNull()
  })

  it('a convert that THROWS (a redeploy under the tab) reports instead of spinning', async () => {
    convertLeadAction.mockRejectedValue(new Error('Failed to find Server Action "x". This request might be from an older or newer deployment.'))
    renderDrawer(makeRow())
    await convert()
    expect(await screen.findByText(/Refresh to keep working/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Book them now' })).toBeNull()
  })
})

describe('LeadDrawer — an already-converted inquiry can book too', () => {
  it('offers "Book a visit" beside "Open patient", on the linked patient', () => {
    renderDrawer(makeRow({ status: 'converted', convertedToPatientId: 'pat_x', convertedPatientName: 'Olivia Chen', preferredDate: 'Nov 3, 2099' }))
    expect(screen.getByRole('link', { name: 'Open patient' })).toHaveAttribute('href', '/patients/pat_x')
    fireEvent.click(screen.getByRole('button', { name: 'Book a visit' }))
    expect(screen.getByTestId('booking-form').textContent).toContain('book:pat_x:Olivia Chen:2099-11-03')
  })
})
