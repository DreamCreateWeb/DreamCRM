import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { LeadRow } from '@/lib/services/leads'

/**
 * ML-22 — "contacted" is no longer the end. The drawer's contacted state
 * carries a call-back DAY (a date input on the clinic's calendar, saved as
 * a day key — the action resolves it to clinic-local noon) and a notes box;
 * the timeline shows the machine's second touch; the approved follow-up is
 * readable under "Follow-up we sent" (the round-3 outbound law). Every
 * await goes through runAction — the file's bare-await allowlist entry was
 * removed and stays at zero (tests/ui/no-bare-await.test.ts).
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const actions = vi.hoisted(() => ({
  setLeadCallBackAction: vi.fn(),
  setLeadNoteAction: vi.fn(),
  getSentInquiryReplyAction: vi.fn(),
  previewLeadConvertAction: vi.fn(async () => ({ ok: true, matchedPatientName: null })),
}))
vi.mock('@/app/(default)/leads/actions', () => ({
  markLeadContactedAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  reopenLeadAction: vi.fn(),
  convertLeadAction: vi.fn(),
  previewLeadConvertAction: actions.previewLeadConvertAction,
  getSentInquiryReplyAction: actions.getSentInquiryReplyAction,
  setLeadCallBackAction: actions.setLeadCallBackAction,
  setLeadNoteAction: actions.setLeadNoteAction,
}))

import LeadDrawer from '@/app/(default)/leads/lead-drawer'

const TZ = 'America/Chicago'

function makeRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'lead_1',
    name: 'Marcus Johnson',
    email: 'marcus@example.com',
    phone: '(415) 555-0156',
    preferredDate: null,
    message: 'Need crown work.',
    sourcePage: '/services',
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    status: 'contacted',
    convertedToPatientId: null,
    convertedPatientName: null,
    contactedAt: new Date('2026-07-27T20:00:00Z'),
    convertedAt: null,
    archivedAt: null,
    archivedReason: null,
    callBackAt: null,
    notes: null,
    followedUpAt: null,
    lastTouchAt: new Date('2026-07-27T20:00:00Z'),
    createdAt: new Date('2026-07-27T15:00:00Z'),
    ageHours: 80,
    ...overrides,
  }
}

function renderDrawer(row: LeadRow) {
  return render(<LeadDrawer timeZone={TZ} row={row} onClose={() => {}} onStatusChange={() => {}} />)
}

beforeEach(() => {
  actions.setLeadCallBackAction.mockReset()
  actions.setLeadNoteAction.mockReset()
  actions.getSentInquiryReplyAction.mockReset()
  actions.getSentInquiryReplyAction.mockResolvedValue({ ok: true, reply: null, followup: null })
})

describe('the call-back day', () => {
  it('a contacted inquiry offers a date input; Save sends the DAY KEY, and the drawer says the day in the board’s voice', async () => {
    actions.setLeadCallBackAction.mockResolvedValue({ ok: true, callBackAt: '2099-08-04T17:00:00.000Z' })
    renderDrawer(makeRow())
    const input = screen.getByLabelText('Call back on') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(input.value).toBe('')
    const save = await screen.findByRole('button', { name: 'Save' })
    expect(save).toBeDisabled() // nothing changed yet
    fireEvent.change(input, { target: { value: '2099-08-04' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.setLeadCallBackAction).toHaveBeenCalledWith('lead_1', '2099-08-04'))
    // Said twice on purpose: the toast and the line under the input.
    expect(await screen.findAllByText(/Call back Aug 4\./)).toHaveLength(2)
    // The timeline carries it too.
    expect(screen.getByText(/Call back · Aug 4, 2099/)).toBeInTheDocument()
    // And a Clear door appears.
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('Clear sends null; a slipped day is said plainly with a next step', async () => {
    actions.setLeadCallBackAction.mockResolvedValue({ ok: true, callBackAt: null })
    renderDrawer(makeRow({ callBackAt: new Date('2000-01-04T18:00:00Z') }))
    expect((screen.getByLabelText('Call back on') as HTMLInputElement).value).toBe('2000-01-04')
    expect(screen.getByText(/Call back was Jan 4 — pick a new day/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(actions.setLeadCallBackAction).toHaveBeenCalledWith('lead_1', null))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument())
  })

  it('a refused save shows the action’s own words and keeps the drawer usable (runAction, never a bare await)', async () => {
    actions.setLeadCallBackAction.mockRejectedValue(new Error('Failed to find Server Action "x". This request might be from an older or newer deployment.'))
    renderDrawer(makeRow())
    fireEvent.change(screen.getByLabelText('Call back on'), { target: { value: '2099-08-04' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await screen.findByText(/refresh/i)
    expect(await screen.findByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-busy', 'true')
  })

  it('the call-back and notes editors belong to the contacted state only; a saved note still reads elsewhere', () => {
    const { unmount } = renderDrawer(makeRow({ status: 'new' }))
    expect(screen.queryByLabelText('Call back on')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
    unmount()
    renderDrawer(makeRow({ status: 'converted', convertedToPatientId: 'pat_1', convertedPatientName: 'Marcus Johnson', notes: 'Prefers mornings.' }))
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
    expect(screen.getByText('Prefers mornings.')).toBeInTheDocument()
  })
})

describe('the notes box', () => {
  it('saves the note through the action and reports it', async () => {
    actions.setLeadNoteAction.mockResolvedValue({ ok: true, notes: 'Left a voicemail.' })
    renderDrawer(makeRow())
    const box = screen.getByLabelText('Notes')
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled()
    fireEvent.change(box, { target: { value: 'Left a voicemail.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(actions.setLeadNoteAction).toHaveBeenCalledWith('lead_1', 'Left a voicemail.'))
    await screen.findByText('Note saved.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled())
  })
})

describe('the second touch on the record', () => {
  it('the timeline shows when the follow-up went out, in the clinic’s clock', () => {
    renderDrawer(makeRow({ followedUpAt: new Date('2026-07-30T15:05:00Z') }))
    expect(screen.getByText(/Followed up · Thu, Jul 30, 10:05 AM/)).toBeInTheDocument()
  })

  it('the approved follow-up is readable under its own block, beside the first reply', async () => {
    actions.getSentInquiryReplyAction.mockResolvedValue({
      ok: true,
      reply: { subject: 'Your question for Acme', body: 'Yes, we do crowns.', sentAtLabel: 'Mon, Jul 27, 3:00 PM', simulated: false },
      followup: { subject: 'Checking in from Acme', body: 'Still happy to help with that crown.', sentAtLabel: 'Thu, Jul 30, 10:05 AM', simulated: false },
    })
    renderDrawer(makeRow())
    await screen.findByText('Still happy to help with that crown.')
    expect(screen.getByText(/^What we sent/)).toBeInTheDocument()
    expect(screen.getByText(/^Follow-up we sent · Thu, Jul 30, 10:05 AM/)).toBeInTheDocument()
    expect(screen.getByText('Yes, we do crowns.')).toBeInTheDocument()
  })
})
