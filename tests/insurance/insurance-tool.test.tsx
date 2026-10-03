import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The Insurance tool's honesty contract in the DOM: a sandbox driver shows
 * the "Practice answer" pill on the header AND on every result, results carry
 * the status tone, the duplicate prompt is inline (no native dialog), and the
 * steering tips only appear in practice mode.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const toast = vi.fn()
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))

const checkInsuranceAction = vi.fn()
const createPatientFromCheckAction = vi.fn()
const saveInsuranceToPatientAction = vi.fn()
const searchPayersAction = vi.fn(async () => ({
  ok: true,
  payers: [
    { stediId: 'QNJCP', displayName: 'Delta Dental of California', primaryPayerId: '77777', aliases: [], coverageTypes: ['dental'], operatingStates: ['CA'], eligibilitySupported: true, score: 2 },
  ],
}))
vi.mock('@/app/(default)/insurance/actions', () => ({
  checkInsuranceAction: (...a: unknown[]) => checkInsuranceAction(...(a as [])),
  createPatientFromCheckAction: (...a: unknown[]) => createPatientFromCheckAction(...(a as [])),
  saveInsuranceToPatientAction: (...a: unknown[]) => saveInsuranceToPatientAction(...(a as [])),
  searchPayersAction: (...a: unknown[]) => searchPayersAction(...(a as [])),
}))

import InsuranceTool from '@/app/(default)/insurance/insurance-tool'
import type { InsuranceCheckView } from '@/lib/insurance-eligibility'

function check(overrides: Partial<InsuranceCheckView> = {}): InsuranceCheckView {
  return {
    id: 'ins_1',
    patientId: null,
    patientName: null,
    driver: 'sandbox',
    status: 'active',
    input: {
      patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' },
      carrierName: 'Delta Dental',
      memberId: 'DD-100-2231',
      groupNumber: null,
      relationship: 'self',
      subscriber: null,
    },
    result: {
      status: 'active',
      payerName: 'Delta Dental',
      planName: 'Delta Dental PPO',
      coverage: { effective: '2026-01-01', termination: null },
      network: 'unknown',
      annualMax: { totalCents: 150_000, usedCents: 62_000, remainingCents: 88_000 },
      deductible: { individualCents: 5_000, metCents: 2_500, remainingCents: 2_500 },
      coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null },
      waitingPeriods: [],
      frequencies: [{ code: 'exam', label: 'Exams', limit: '2 per year', lastOn: '2026-04-30' }],
      missingToothClause: false,
      notes: ['Bitewings were last taken over a year ago, so a new set is covered.'],
      asOf: '2026-09-30T15:00:00.000Z',
    },
    error: null,
    checkedAtIso: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    requestedByUserId: 'u_1',
    requestedByName: 'Dana Whitfield',
    ...overrides,
  }
}

function renderTool(props: Partial<React.ComponentProps<typeof InsuranceTool>> = {}) {
  return render(
    <InsuranceTool
      orgName="Dream Dental"
      recent={[]}
      carriers={['Delta Dental', 'Cigna']}
      patientOptions={[{ id: 'pat_1', name: 'Mia Hayes' }]}
      timeZone="America/Chicago"
      prefill={null}
      initialCheck={null}
      driver="sandbox"
      {...props}
    />,
  )
}

beforeEach(() => {
  push.mockClear()
  toast.mockClear()
  checkInsuranceAction.mockReset()
  createPatientFromCheckAction.mockReset()
})

describe('InsuranceTool — honesty', () => {
  it('shows the practice pill in the header before any result, with the explanation as its title', () => {
    renderTool()
    const pill = screen.getByText('Practice answer')
    expect(pill.getAttribute('data-tone')).toBe('neutral')
    expect(pill.getAttribute('title')).toMatch(/not a real payer check/i)
    expect(screen.getByText('Practice-mode tips')).toBeTruthy()
    expect(screen.getByText('Nothing checked yet')).toBeTruthy()
  })

  it('renders a result with its status tone AND a second practice pill on the card', () => {
    renderTool({ initialCheck: check(), recent: [check()] })
    const active = screen.getAllByText('Active')
    expect(active.length).toBeGreaterThan(0)
    expect(active[0].getAttribute('data-tone')).toBe('ok')
    expect(screen.getAllByText('Practice answer').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Delta Dental PPO')).toBeTruthy()
    expect(screen.getByText('$880 left')).toBeTruthy()
  })

  it('a coverage-ended answer is urgent; a failed check is warn and offers a retry', () => {
    const { unmount } = renderTool({ initialCheck: check({ status: 'inactive', result: { ...check().result!, status: 'inactive', coveragePct: null, annualMax: null, deductible: null, frequencies: [] } }) })
    expect(screen.getByText('Not active').getAttribute('data-tone')).toBe('urgent')
    unmount()
    renderTool({ initialCheck: check({ status: 'error', result: null, error: 'Sandbox: simulated payer timeout' }) })
    expect(screen.getByText('Couldn’t check').getAttribute('data-tone')).toBe('warn')
    expect(screen.getByText('Try again')).toBeTruthy()
  })
})

describe('InsuranceTool — form + add-as-patient', () => {
  it('validates inline before calling the server', async () => {
    renderTool()
    fireEvent.click(screen.getByText('Check benefits'))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(checkInsuranceAction).not.toHaveBeenCalled()
  })

  it('offers "Add as a patient" for an unattached check and shows the duplicate prompt inline', async () => {
    createPatientFromCheckAction.mockResolvedValueOnce({ ok: false, duplicateOf: { id: 'pat_dup', name: 'Mia Hayes' } })
    renderTool({ initialCheck: check() })
    fireEvent.click(screen.getByText('Add Mia as a patient'))
    await waitFor(() => expect(screen.getByText(/already here/)).toBeTruthy())
    expect(screen.getByText('Open their record').closest('a')?.getAttribute('href')).toBe('/patients/pat_dup')
    createPatientFromCheckAction.mockResolvedValueOnce({ ok: true, id: 'pat_new' })
    fireEvent.click(screen.getByText('Add anyway'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/patients/pat_new'))
    expect(createPatientFromCheckAction).toHaveBeenLastCalledWith(expect.objectContaining({ forceNew: true }))
  })

  it('an attached check offers Save to their record instead of Add', () => {
    renderTool({
      prefill: { patientId: 'pat_1', patientName: 'Mia Hayes', request: check().input },
      initialCheck: check({ patientId: 'pat_1', patientName: 'Mia Hayes' }),
    })
    expect(screen.getByText('Save to their record')).toBeTruthy()
    expect(screen.queryByText(/as a patient/)).toBeNull()
  })

  it('under a Stedi driver the carrier box becomes a payer picker, the test pill shows, and the steering tips do not', async () => {
    renderTool({ driver: 'stedi_test' })
    expect(screen.getByText('Test payer answer').getAttribute('data-tone')).toBe('neutral')
    expect(screen.queryByText('Practice-mode tips')).toBeNull()
    fireEvent.change(screen.getByLabelText('Payer'), { target: { value: 'Delta' } })
    await waitFor(() => expect(screen.getByText('Delta Dental of California')).toBeTruthy())
    expect(screen.getByText('Dental')).toBeTruthy()
    fireEvent.click(screen.getByText('Delta Dental of California'))
    expect(screen.getByText('77777')).toBeTruthy()
    expect(searchPayersAction).toHaveBeenCalledWith('Delta')
  })

  it('a failed check shows the stored reason as-is — a setup problem is never dressed up as "try again"', () => {
    renderTool({ initialCheck: check({ status: 'error', result: null, error: 'Blue Advantage doesn’t recognize the practice’s NPI, so it won’t answer about any member.' }) })
    expect(screen.getByText(/doesn’t recognize the practice’s NPI/)).toBeTruthy()
    expect(screen.queryByText(/try again in a moment/)).toBeNull()
  })

  it('a frequency row prefers the payer’s next eligible date over the last visit', () => {
    renderTool({ initialCheck: check({ result: { ...check().result!, frequencies: [{ code: 'fmx', label: 'Full-mouth X-rays', limit: '1 every 60 months', lastOn: null, nextOn: '2028-12-08' }] } }) })
    expect(screen.getByText('next from 2028-12-08')).toBeTruthy()
  })

  it('a tier the payer never stated renders as a dash, never a number', () => {
    renderTool({ initialCheck: check({ driver: 'stedi', result: { ...check().result!, coveragePct: { preventive: 100, basic: null, major: null, ortho: null } } }) })
    expect(screen.getByText('Payer answer')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('a payer that only states the maximum gets honest copy — never "$0 used" — and the amber caveat', () => {
    renderTool({ initialCheck: check({ result: { ...check().result!, annualMax: { totalCents: 150_000, usedCents: null, remainingCents: null }, deductible: { individualCents: 5_000, metCents: null, remainingCents: null } } }) })
    expect(screen.getByText('Up to $1,500')).toBeTruthy()
    expect(screen.getByText('the payer didn’t say how much is used')).toBeTruthy()
    expect(screen.getByText('Yearly maximum')).toBeTruthy()
    expect(screen.getByText('the payer didn’t say how much is met')).toBeTruthy()
    expect(screen.queryByText(/\$0 used/)).toBeNull()
  })

  it('a remaining-only answer is shown as what is left, with the missing total named', () => {
    renderTool({ initialCheck: check({ result: { ...check().result!, annualMax: { totalCents: null, usedCents: null, remainingCents: 42_000 } } }) })
    expect(screen.getByText('$420 left')).toBeTruthy()
    expect(screen.getByText('the payer didn’t say the yearly maximum')).toBeTruthy()
  })

  it('says who ran the check and how long ago, and offers Check again on a good answer', () => {
    renderTool({ initialCheck: check() })
    expect(screen.getByText(/Checked 3 days ago by Dana Whitfield/)).toBeTruthy()
    expect(screen.getByText('Check again')).toBeTruthy()
    expect(screen.queryByText('Worth a re-check')).toBeNull()
  })

  it('a month-old verdict wears the warn re-check pill; a failed check does not (nothing to go stale)', () => {
    const old = new Date(Date.now() - 45 * 86_400_000).toISOString()
    const { unmount } = renderTool({ initialCheck: check({ checkedAtIso: old }) })
    expect(screen.getByText('Worth a re-check').getAttribute('data-tone')).toBe('warn')
    expect(screen.getByText(/Checked a month ago/)).toBeTruthy()
    unmount()
    renderTool({ initialCheck: check({ checkedAtIso: old, status: 'error', result: null, error: 'Sandbox: simulated payer timeout' }) })
    expect(screen.queryByText('Worth a re-check')).toBeNull()
  })

  it('plan rules show the missing-tooth clause only when true, plus ortho lifetime and family amounts', () => {
    const { unmount } = renderTool({
      initialCheck: check({
        result: {
          ...check().result!,
          missingToothClause: true,
          orthoLifetimeMax: { totalCents: 150_000, usedCents: 0, remainingCents: 150_000 },
          familyMax: { totalCents: 400_000, usedCents: null, remainingCents: null },
        },
      }),
    })
    expect(screen.getByText('Plan rules')).toBeTruthy()
    expect(screen.getByText(/Missing-tooth clause applies/)).toBeTruthy()
    expect(screen.getByText(/Ortho lifetime maximum: \$1,500 left/)).toBeTruthy()
    expect(screen.getByText(/Family maximum: Up to \$4,000/)).toBeTruthy()
    unmount()
    renderTool({ initialCheck: check() })
    expect(screen.queryByText('Plan rules')).toBeNull()
  })

  it('picking an existing patient navigates to the server prefill', () => {
    renderTool()
    fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'pat_1' } })
    expect(push).toHaveBeenCalledWith('/insurance?patient=pat_1')
  })
})
