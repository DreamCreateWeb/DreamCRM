import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * THE DOORS WITH REAL SETUP (docs/ACTIVATION.md S5). Each is the intro
 * shell — what it does, what to know — filled with the feature's own
 * facts, then ONE button. Intake: pick what to collect (the basics
 * always), preview the questions, the true sentence about how patients
 * get it, and the button builds the form + flips the switch. Growth: the
 * facts the first win needs, each with a door, and the live "due and
 * reachable" count. Payments: where Stripe stands, the real connect link
 * that returns to Payments, and the button. Members read who can.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }), usePathname: () => '/x' }))
const enableFeatureAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/feature-switch-actions', () => ({
  enableFeatureAction: (...a: unknown[]) => enableFeatureAction(...(a as [])),
  disableFeatureAction: vi.fn(),
}))
const turnOnIntake = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/intake-forms/actions', () => ({ turnOnIntakeFormsAction: (...a: unknown[]) => turnOnIntake(...(a as [])) }))

import IntakeIntroCard from '@/app/(default)/intake-forms/intake-intro-card'
import GrowthIntroCard from '@/app/(default)/growth/growth-intro-card'
import PaymentsIntroCard from '@/app/(default)/payments/payments-intro-card'
import { intakeSectionChoices } from '@/lib/types/forms'
import { FEATURE_BY_KEY } from '@/lib/feature-switches'

beforeEach(() => {
  refresh.mockClear()
  enableFeatureAction.mockClear()
  turnOnIntake.mockClear()
})

describe('IntakeIntroCard', () => {
  const sections = intakeSectionChoices()

  it('shows the registry copy, every section as a choice with the basics locked on, and a question preview', () => {
    render(<IntakeIntroCard orgName="Dream Dental" canManage sections={sections} existingForms={0} patientCount={12} />)
    for (const line of FEATURE_BY_KEY.intake_forms.does) expect(screen.getByText(line)).toBeInTheDocument()
    const list = screen.getByTestId('intake-sections')
    const boxes = within(list).getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(sections.length)
    expect(boxes.every((b) => b.checked)).toBe(true)
    const basics = within(list).getByLabelText(/About you/) as HTMLInputElement
    expect(basics.disabled).toBe(true)
    fireEvent.click(within(list).getAllByRole('button', { name: /See the questions/ })[0])
    expect(screen.getByTestId('intake-preview-patient_info')).toHaveTextContent('First name')
    expect(screen.getByText(/Every booking confirmation carries the link/)).toBeInTheDocument()
  })

  it('unticking a section changes the count, and the button sends the kept ids to the door’s own action', async () => {
    render(<IntakeIntroCard orgName="Dream Dental" canManage sections={sections} existingForms={0} patientCount={0} />)
    const before = screen.getByTestId('intake-count').textContent
    fireEvent.click(screen.getByLabelText(/Dental history/))
    expect(screen.getByTestId('intake-count').textContent).not.toBe(before)
    expect(screen.getByText(/No patients loaded yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Intake Forms' }))
    await waitFor(() => expect(turnOnIntake).toHaveBeenCalledTimes(1))
    const arg = (turnOnIntake.mock.calls as unknown as Array<[{ sections: string[] }]>)[0][0]
    expect(arg.sections).toContain('patient_info')
    expect(arg.sections).not.toContain('dental')
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(enableFeatureAction).not.toHaveBeenCalled()
  })

  it('a clinic with forms on file keeps them: no picker, the button only flips the switch', () => {
    render(<IntakeIntroCard orgName="Dream Dental" canManage sections={sections} existingForms={2} patientCount={40} />)
    expect(screen.getByTestId('intake-existing')).toHaveTextContent('2 forms on file')
    expect(screen.queryByTestId('intake-sections')).toBeNull()
  })

  it('an unreadable form count says so, and never counts as "forms on file" (audit round 1)', () => {
    render(<IntakeIntroCard orgName="Dream Dental" canManage sections={sections} existingForms={null} patientCount={null} />)
    expect(screen.getByTestId('intake-unreadable')).toBeInTheDocument()
    expect(screen.queryByTestId('intake-existing')).toBeNull()
    expect(screen.getByText(/Couldn’t count your patients just now/)).toBeInTheDocument()
  })

  it('a member reads who can, with no button', () => {
    render(<IntakeIntroCard orgName="Dream Dental" canManage={false} sections={sections} existingForms={0} patientCount={0} />)
    expect(screen.queryByRole('button', { name: /Turn on/ })).toBeNull()
    expect(screen.getByText('An owner or admin can turn this on.')).toBeInTheDocument()
  })
})

describe('GrowthIntroCard', () => {
  it('a bare clinic: the facts name what the first win needs, each with a door', () => {
    render(<GrowthIntroCard orgName="Dream Dental" canManage patientCount={0} google={null} dueReachable={null} marketable={null} />)
    const facts = screen.getByTestId('growth-facts')
    expect(within(facts).getByText('No patients yet')).toBeInTheDocument()
    expect(within(facts).getByRole('link', { name: /Connect your practice software/ })).toHaveAttribute('href', '/integrations/pms')
    expect(within(facts).getByRole('link', { name: /import a CSV/ })).toHaveAttribute('href', '/patients')
    expect(within(facts).getByText('Google not connected')).toBeInTheDocument()
    expect(within(facts).getByRole('link', { name: /Connect Google/ })).toHaveAttribute('href', '/integrations')
    expect(screen.queryByTestId('growth-due')).toBeNull()
  })

  it('a loaded clinic: the live due-and-reachable count, and the generic switch on the button', async () => {
    render(<GrowthIntroCard orgName="Dream Dental" canManage patientCount={412} google={{ name: 'Dream Dental' }} dueReachable={38} marketable={300} />)
    expect(screen.getByText('Patients loaded')).toBeInTheDocument()
    expect(screen.getByText('Google connected')).toBeInTheDocument()
    expect(screen.getByTestId('growth-due')).toHaveTextContent('38 due and reachable')
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Growth' }))
    await waitFor(() => expect(enableFeatureAction).toHaveBeenCalledWith('growth'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('an unreadable count says so instead of showing a zero', () => {
    render(<GrowthIntroCard orgName="Dream Dental" canManage patientCount={50} google={null} dueReachable={null} marketable={null} />)
    expect(screen.getByTestId('growth-due')).toHaveTextContent('Couldn’t count them just now')
  })

  it('an unreadable patient count or Google read is a neutral "couldn’t read" — never "no patients" or "not connected" (audit round 1)', () => {
    render(<GrowthIntroCard orgName="Dream Dental" canManage patientCount={null} google="unreadable" dueReachable={null} marketable={null} />)
    const facts = screen.getByTestId('growth-facts')
    expect(within(facts).getByText('Couldn’t count patients just now')).toBeInTheDocument()
    expect(within(facts).queryByText('No patients yet')).toBeNull()
    expect(within(facts).getByText('Couldn’t read Google just now')).toBeInTheDocument()
    expect(within(facts).queryByText('Google not connected')).toBeNull()
  })
})

describe('PaymentsIntroCard', () => {
  it('not connected: the real connect link returns to Payments; the button turns on anyway', async () => {
    render(<PaymentsIntroCard orgName="Dream Dental" canManage stripe="none" connectConfigured isDemo={false} />)
    expect(screen.getByText('Stripe not connected')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect Stripe' })).toHaveAttribute('href', '/api/connect/shop/start?back=payments')
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Payments' }))
    await waitFor(() => expect(enableFeatureAction).toHaveBeenCalledWith('payments'))
  })

  it('connected / pending / unconfigured each say the true state', () => {
    const { unmount } = render(<PaymentsIntroCard orgName="D" canManage stripe="ready" connectConfigured isDemo={false} />)
    expect(screen.getByText('Stripe connected')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
    unmount()
    render(<PaymentsIntroCard orgName="D" canManage stripe="pending" connectConfigured isDemo={false} />)
    expect(screen.getByText('Finish setup in Stripe')).toBeInTheDocument()
  })

  it('no connect link for a member, the demo, or an installation without Connect', () => {
    const { unmount } = render(<PaymentsIntroCard orgName="D" canManage={false} stripe="none" connectConfigured isDemo={false} />)
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
    unmount()
    render(<PaymentsIntroCard orgName="D" canManage stripe="none" connectConfigured={false} isDemo={false} />)
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
    expect(screen.getByText(/isn’t configured on this installation/)).toBeInTheDocument()
  })
})
