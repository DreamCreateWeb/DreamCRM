import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const checkInsuranceAction = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, check: { status: 'active' } }))
const saveSecondaryInsuranceAction = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }))
vi.mock('@/app/(default)/insurance/actions', () => ({
  checkInsuranceAction: (...a: unknown[]) => checkInsuranceAction(...a),
  saveSecondaryInsuranceAction: (...a: unknown[]) => saveSecondaryInsuranceAction(...a),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => vi.fn() }))

import SecondaryPlan from '@/app/(default)/patients/[id]/secondary-plan'
import { BenefitsSheet } from '@/app/(default)/insurance/benefits-sheet'

beforeEach(() => {
  checkInsuranceAction.mockClear()
  saveSecondaryInsuranceAction.mockClear()
})

describe('SecondaryPlan — the record’s second card', () => {
  it('with no second plan it offers one door, and saving sends that card (never a check)', async () => {
    render(<SecondaryPlan patientId="pat_1" data={{ card: null, latest: null, onFileRequest: null }} />)
    fireEvent.click(screen.getByText('Add a secondary plan'))
    const [carrier, member, group] = screen.getAllByRole('textbox')
    fireEvent.change(carrier, { target: { value: 'Cigna' } })
    fireEvent.change(member, { target: { value: 'CG-200' } })
    fireEvent.change(group, { target: { value: 'G9' } })
    fireEvent.click(screen.getByText('Save second plan'))
    await waitFor(() => expect(saveSecondaryInsuranceAction).toHaveBeenCalledWith('pat_1', { carrierName: 'Cigna', memberId: 'CG-200', groupNumber: 'G9' }))
    expect(checkInsuranceAction).not.toHaveBeenCalled()
  })

  it('Check now is a person’s tap and names the SECONDARY rank', async () => {
    const req = { carrierName: 'Cigna', memberId: 'CG-200' }
    render(<SecondaryPlan patientId="pat_1" data={{ card: { provider: 'Cigna', policyNumber: 'CG-200', groupNumber: null }, latest: null, onFileRequest: req }} />)
    expect(checkInsuranceAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Check now'))
    await waitFor(() => expect(checkInsuranceAction).toHaveBeenCalledWith(req, 'pat_1', 'secondary'))
  })

  it('a carrier NAME alone sends them to the payer picker instead of a check that would be refused', () => {
    render(<SecondaryPlan patientId="pat_1" data={{ card: { provider: 'Cigna', policyNumber: 'CG-200', groupNumber: null }, latest: null, onFileRequest: {}, needsPayerPick: true }} />)
    expect(screen.queryByText('Check now')).toBeNull()
    expect(screen.getByText(/Pick the payer in Insurance/).closest('a')?.getAttribute('href')).toBe('/insurance?patient=pat_1&plan=secondary')
  })
})

describe('the printable sheet shows both plans', () => {
  it('lists primary and secondary with each plan’s own verified line', () => {
    const check = {
      id: 'ins_1', patientId: 'pat_1', patientName: 'Mia Hayes', rank: 'secondary', driver: 'sandbox', status: 'active',
      input: { patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' }, carrierName: 'Cigna', memberId: 'CG-200', groupNumber: null, relationship: 'self', subscriber: null },
      result: null, error: null, checkedAtIso: '2026-11-05T18:00:00Z', requestedByUserId: null, requestedByName: null,
    }
    render(
      <BenefitsSheet
        check={check as never}
        clinicName="Test Dental"
        timeZone="America/Chicago"
        plans={{
          primary: { carrier: 'Delta Dental', memberId: 'DD-100', groupNumber: null, verified: 'Verified Nov 2, 2026' },
          secondary: { carrier: 'Cigna', memberId: 'CG-200', groupNumber: null, verified: null },
        }}
      />,
    )
    const box = screen.getByTestId('sheet-both-plans')
    expect(box.textContent).toMatch(/Primary:.*Delta Dental.*Verified Nov 2, 2026/)
    expect(box.textContent).toMatch(/Secondary:.*Cigna.*not verified yet/)
    expect(screen.getByText(/Secondary plan/)).toBeTruthy()
  })
})
