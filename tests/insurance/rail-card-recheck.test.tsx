import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The patient record's insurance rail card: "Check again" sends the request
 * the PAGE resolved (`recheckRequest`), never `latest.input` on its own —
 * and when the policy number on file no longer matches the last check, the
 * card says so. Each wrong re-check is a billed 270.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => () => {} }))
const checkInsuranceAction = vi.fn(async (_input: unknown, _patientId: string | null) => ({
  ok: true as const,
  check: { status: 'active' },
}))
vi.mock('@/app/(default)/insurance/actions', () => ({
  checkInsuranceAction: (input: unknown, patientId: string | null) => checkInsuranceAction(input, patientId),
}))

import InsurancePanel from '@/app/(default)/patients/[id]/insurance-panel'

const storedInput = {
  patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1990-04-15' },
  carrierName: 'Delta Dental',
  memberId: 'POL-OLD-123',
  groupNumber: 'GRP-1',
  relationship: 'self' as const,
  subscriber: null,
}
const onFileRequest = { ...storedInput, memberId: 'POL-NEW-999' }
const latest = {
  id: 'ins_1',
  patientId: 'pat_1',
  patientName: 'Mia Hayes',
  driver: 'sandbox' as const,
  status: 'inactive' as const,
  input: storedInput,
  result: null,
  error: null,
  checkedAtIso: '2026-10-20T15:00:00.000Z',
  requestedByUserId: null,
  requestedByName: null,
}

beforeEach(() => {
  checkInsuranceAction.mockClear()
})

describe('InsurancePanel — Check again sends the resolved card', () => {
  it('sends data.onFileRequest, not latest.input, after the policy number changed — and says the card changed', async () => {
    render(
      <InsurancePanel
        patientId="pat_1"
        data={{ latest: latest as never, hasOnFile: true, onFileRequest, cardChanged: true }}
        timeZone="America/Chicago"
      />,
    )
    const pill = screen.getByText('Card changed since the last check')
    expect(pill.getAttribute('data-tone')).toBe('neutral')
    fireEvent.click(screen.getByText('Check again'))
    await waitFor(() => expect(checkInsuranceAction).toHaveBeenCalledTimes(1))
    const [sent, patientId] = checkInsuranceAction.mock.calls[0]
    expect((sent as { memberId: string }).memberId).toBe('POL-NEW-999')
    expect(sent).toBe(onFileRequest)
    expect(patientId).toBe('pat_1')
  })

  it('shows no "card changed" pill while the stored check is still the card on file', () => {
    render(
      <InsurancePanel
        patientId="pat_1"
        data={{ latest: latest as never, hasOnFile: true, onFileRequest: storedInput, cardChanged: false }}
        timeZone="America/Chicago"
      />,
    )
    expect(screen.queryByText('Card changed since the last check')).toBeNull()
  })

  it('a thrown action (a redeploy under the tab) lands as a sentence, not a spinner', async () => {
    checkInsuranceAction.mockRejectedValueOnce(new Error('Failed to find Server Action'))
    render(
      <InsurancePanel
        patientId="pat_1"
        data={{ latest: latest as never, hasOnFile: true, onFileRequest, cardChanged: true }}
        timeZone="America/Chicago"
      />,
    )
    fireEvent.click(screen.getByText('Check again'))
    expect(await screen.findByText(/didn’t go through/)).toBeTruthy()
  })
})
