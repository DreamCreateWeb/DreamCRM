import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE INTRO CARD: what a clinic meets before the tool is on. One button for
 * an owner/admin, a sentence for a member; "Enable and set up" opens the
 * setup (the NPI box) and "Turn on insurance checks" calls the action; a
 * refusal renders inline; the honesty line shows under a practice driver.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const enableInsuranceAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/insurance/actions', () => ({
  enableInsuranceAction: (...a: unknown[]) => enableInsuranceAction(...(a as [])),
}))

import InsuranceIntro from '@/app/(default)/insurance/intro'
import { INSURANCE_INTRO } from '@/lib/insurance-eligibility'

beforeEach(() => {
  refresh.mockClear()
  enableInsuranceAction.mockClear()
})

describe('InsuranceIntro', () => {
  it('explains the feature, says the month’s allowance plainly, and offers ONE button to an owner/admin', () => {
    render(<InsuranceIntro orgName="Dream Dental" canManage driver="stedi_test" npi={null} />)
    expect(screen.getByTestId('insurance-intro')).toBeInTheDocument()
    for (const line of INSURANCE_INTRO.does) expect(screen.getByText(line)).toBeInTheDocument()
    expect(screen.getByText(/200 checks a month are included/)).toBeInTheDocument()
    expect(screen.getByText('Not turned on')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable and set up' })).toBeInTheDocument()
    expect(screen.queryByTestId('insurance-setup')).toBeNull()
    // The honesty line under a practice/test driver.
    expect(screen.getByText(/Right now every answer is a/)).toHaveTextContent('test payer answer')
  })

  it('a member sees the card without the button', () => {
    render(<InsuranceIntro orgName="Dream Dental" canManage={false} driver="sandbox" npi={null} />)
    expect(screen.queryByRole('button', { name: 'Enable and set up' })).toBeNull()
    expect(screen.getByText(INSURANCE_INTRO.askManager)).toBeInTheDocument()
  })

  it('Enable and set up opens the setup with the NPI prefilled from the profile; Turn on calls the action and refreshes', async () => {
    render(<InsuranceIntro orgName="Dream Dental" canManage driver="sandbox" npi="1234567893" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable and set up' }))
    const box = screen.getByLabelText(/Practice NPI/) as HTMLInputElement
    expect(box.value).toBe('1234567893')
    expect(screen.getByText(/optional for now/)).toBeInTheDocument()
    fireEvent.change(box, { target: { value: '123-456-7893' } })
    fireEvent.click(screen.getByRole('button', { name: 'Turn on insurance checks' }))
    await waitFor(() => expect(enableInsuranceAction).toHaveBeenCalledWith({ npi: '123-456-7893' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('under the live driver the NPI is not optional, and a refusal renders inline', async () => {
    enableInsuranceAction.mockResolvedValueOnce({ ok: false, error: 'An NPI is ten digits' } as never)
    render(<InsuranceIntro orgName="Dream Dental" canManage driver="stedi" npi={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable and set up' }))
    expect(screen.queryByText(/optional for now/)).toBeNull()
    expect(screen.queryByText(/Right now every answer is a/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on insurance checks' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('An NPI is ten digits'))
    expect(refresh).not.toHaveBeenCalled()
    // Not now folds the setup away.
    fireEvent.click(screen.getByText('Not now'))
    expect(screen.queryByTestId('insurance-setup')).toBeNull()
  })
})
