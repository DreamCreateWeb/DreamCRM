import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { LeadRow } from '@/lib/services/leads'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const { previewLeadConvertAction } = vi.hoisted(() => ({ previewLeadConvertAction: vi.fn() }))
vi.mock('@/app/(default)/leads/actions', () => ({
  markLeadContactedAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  reopenLeadAction: vi.fn(),
  convertLeadAction: vi.fn(),
  previewLeadConvertAction,
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

beforeEach(() => previewLeadConvertAction.mockReset())

describe('LeadDrawer — existing-patient hint on open', () => {
  it('shows the sky info chip when the dedupe dry-run matches a patient', async () => {
    previewLeadConvertAction.mockResolvedValue({ ok: true, matchedPatientName: 'Olivia Chen' })
    render(<LeadDrawer row={makeRow()} onClose={() => {}} />)
    // Runs the preview on open (not just inside Convert).
    await waitFor(() => expect(previewLeadConvertAction).toHaveBeenCalledWith('lead_1'))
    const hint = await screen.findByText(/Looks like an existing patient/)
    expect(hint).toBeInTheDocument()
    expect(hint.closest('div')?.className).toContain('text-sky-700')
  })

  it('shows no chip when there is no match', async () => {
    previewLeadConvertAction.mockResolvedValue({ ok: true, matchedPatientName: null })
    render(<LeadDrawer row={makeRow()} onClose={() => {}} />)
    await waitFor(() => expect(previewLeadConvertAction).toHaveBeenCalled())
    expect(screen.queryByText(/Looks like an existing patient/)).not.toBeInTheDocument()
  })

  it('does not run the preview for converted leads (already linked)', async () => {
    render(
      <LeadDrawer
        row={makeRow({ status: 'converted', convertedToPatientId: 'pat_x', convertedPatientName: 'Olivia Chen' })}
        onClose={() => {}}
      />,
    )
    // Give any (mistaken) effect a tick to fire.
    await new Promise((r) => setTimeout(r, 0))
    expect(previewLeadConvertAction).not.toHaveBeenCalled()
  })

  it('stays silent when the preview reports a failure (non-blocking)', async () => {
    // previewLeadConvertAction catches internally and returns { ok: false }
    // (it never rejects). The drawer must not show the chip in that case.
    previewLeadConvertAction.mockResolvedValue({ ok: false, error: 'lead gone' })
    render(<LeadDrawer row={makeRow()} onClose={() => {}} />)
    await waitFor(() => expect(previewLeadConvertAction).toHaveBeenCalled())
    expect(screen.queryByText(/Looks like an existing patient/)).not.toBeInTheDocument()
  })
})
