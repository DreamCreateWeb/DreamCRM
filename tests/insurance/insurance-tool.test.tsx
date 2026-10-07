import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

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
const confirmFn = vi.fn(async () => false)
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmFn }))

const checkInsuranceAction = vi.fn()
const createPatientFromCheckAction = vi.fn()
const saveInsuranceToPatientAction = vi.fn()
const searchPayersAction = vi.fn(async () => ({
  ok: true,
  payers: [
    { stediId: 'QNJCP', displayName: 'Delta Dental of California', primaryPayerId: '77777', aliases: [], coverageTypes: ['dental'], operatingStates: ['CA'], eligibilitySupported: true, score: 2 },
  ],
}))
const scanCardAction = vi.fn()
const disableInsuranceAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/insurance/actions', () => ({
  disableInsuranceAction: (...a: unknown[]) => disableInsuranceAction(...(a as [])),
  checkInsuranceAction: (...a: unknown[]) => checkInsuranceAction(...(a as [])),
  createPatientFromCheckAction: (...a: unknown[]) => createPatientFromCheckAction(...(a as [])),
  saveInsuranceToPatientAction: (...a: unknown[]) => saveInsuranceToPatientAction(...(a as [])),
  searchPayersAction: (...a: unknown[]) => searchPayersAction(...(a as [])),
  scanCardAction: (...a: unknown[]) => scanCardAction(...(a as [])),
}))
const uploadFileWithProgress = vi.fn((file: File) => ({ promise: Promise.resolve(`https://storage.test/insurance-cards/${file.name}`), cancel: () => {} }))
vi.mock('@/lib/upload-with-progress', () => ({
  uploadFileWithProgress: (...a: unknown[]) => uploadFileWithProgress(...(a as [File])),
  UploadCancelledError: class extends Error {},
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
    expect(screen.getByText('Not until Dec 8, 2028')).toBeTruthy()
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

describe('InsuranceTool — the benefits card (design pass)', () => {
  it('draws the hero number with its ring when the payer stated both ends', () => {
    renderTool({ initialCheck: check() })
    expect(screen.getByTestId('hero-max').textContent).toBe('$880 left')
    // used ÷ total = 62000 / 150000 → 41% — the ring's label says so.
    expect(screen.getByRole('img', { name: '41% of the yearly maximum used' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '50% of the deductible met' })).toBeTruthy()
  })

  it('a total-only answer gets copy and NO ring — the honesty rule beats the heartbeat rule', () => {
    renderTool({ initialCheck: check({ result: { ...check().result!, annualMax: { totalCents: 150_000, usedCents: null, remainingCents: null }, deductible: null } }) })
    expect(screen.getByTestId('hero-max').textContent).toBe('Up to $1,500')
    expect(screen.queryByRole('img', { name: /yearly maximum used/ })).toBeNull()
  })

  it('renders four tier tiles with a fill bar each; an unstated tier draws an empty track', () => {
    renderTool({ initialCheck: check() })
    const tiles = screen.getByTestId('tier-tiles')
    expect(tiles.querySelectorAll('[data-testid="fill-bar"]').length).toBe(4)
    expect(tiles.querySelector('[data-pct="100"]')).toBeTruthy()
    expect(tiles.querySelector('[data-pct=""]')).toBeTruthy() // ortho unstated
    expect(screen.queryByText('Not covered')).toBeNull()
  })

  it('a stated-zero tier reads "Not covered"', () => {
    renderTool({ initialCheck: check({ result: { ...check().result!, coveragePct: { preventive: 100, basic: 80, major: 50, ortho: 0 } } }) })
    expect(screen.getByText('Not covered')).toBeTruthy()
  })

  it('the frequencies table tones the Next cell by date: past is ok, future is warn, last-only is neutral', () => {
    renderTool({
      initialCheck: check({
        result: {
          ...check().result!,
          frequencies: [
            { code: 'exam', label: 'Exams', limit: '2 per plan year', lastOn: null, nextOn: '2024-06-13' },
            { code: 'fmx', label: 'Full-mouth X-rays', limit: '1 every 60 months', lastOn: null, nextOn: '2099-12-08' },
            { code: 'prophy', label: 'Cleanings', limit: '2 per year', lastOn: '2026-04-30', nextOn: null },
          ],
        },
      }),
    })
    expect(screen.getByText('Covered now').className).toMatch(/emerald/)
    expect(screen.getByText('Not until Dec 8, 2099').className).toMatch(/amber/)
    expect(screen.getByText('Last Apr 30, 2026').className).toMatch(/gray/)
    expect(screen.getByRole('columnheader', { name: 'Service' })).toBeTruthy()
  })

  it('waiting periods are warn chips with the end date', () => {
    renderTool({ initialCheck: check({ result: { ...check().result!, waitingPeriods: [{ category: 'major', endsOn: '2027-07-01' }] } }) })
    const chip = screen.getByText('Major (crowns, bridges) — covered from Jul 1, 2027')
    expect(chip.getAttribute('data-tone')).toBe('warn')
  })

  it('the empty state offers one CTA that puts the cursor in the first empty field', () => {
    renderTool()
    const cta = screen.getAllByText('Start with a name')[0]
    fireEvent.click(cta)
    expect(document.activeElement?.id).toBe('ins-first')
  })

  it('the recent list marks the loaded row with the inset ring and names the driver in a word', () => {
    renderTool({ initialCheck: check(), recent: [check(), check({ id: 'ins_2', driver: 'stedi' })] })
    // The notes list is a list too — only the recent rows are buttons inside list items.
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('li > button'))
    expect(rows[0].getAttribute('data-selected')).toBe('true')
    expect(rows[0].className).toMatch(/ring-inset/)
    expect(rows[1].getAttribute('data-selected')).toBeNull()
    // "Payer" is also the header row's column label — look for the pill.
    expect(screen.getAllByText('Practice').some((el) => el.getAttribute('data-tone') === 'neutral')).toBe(true)
    expect(screen.getAllByText('Payer').some((el) => el.getAttribute('data-tone') === 'neutral')).toBe(true)
  })

  it('a failed check is framed as what happened, with the stored reason verbatim', () => {
    renderTool({ initialCheck: check({ status: 'error', result: null, error: 'Sandbox: simulated payer timeout' }) })
    expect(screen.getByText('What happened')).toBeTruthy()
    expect(screen.getByText('Sandbox: simulated payer timeout')).toBeTruthy()
  })

  it('picking an existing patient navigates to the server prefill', () => {
    renderTool()
    fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'pat_1' } })
    expect(push).toHaveBeenCalledWith('/insurance?patient=pat_1')
  })
})

describe('InsuranceTool — the desk’s paper (print, copy, filters)', () => {
  it('a good answer offers Print and Copy; a failed check offers neither', () => {
    const { unmount } = renderTool({ initialCheck: check() })
    expect(screen.getByText('🖨 Print sheet')).toBeTruthy()
    expect(screen.getByText('Copy summary')).toBeTruthy()
    // The print sheet exists ONLY while printing: nothing at rest, mounted on
    // beforeprint (the button and Ctrl+P both fire it), gone on afterprint.
    expect(screen.queryByTestId('benefits-sheet')).toBeNull()
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    const sheet = screen.getByTestId('benefits-sheet')
    expect(sheet.textContent).toContain('not a real payer check')
    expect(sheet.textContent).toContain('Mia Hayes')
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(screen.queryByTestId('benefits-sheet')).toBeNull()
    unmount()
    renderTool({ initialCheck: check({ status: 'error', result: null, error: 'Sandbox: simulated payer timeout' }) })
    expect(screen.queryByText('🖨 Print sheet')).toBeNull()
    expect(screen.queryByText('Copy summary')).toBeNull()
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(screen.queryByTestId('benefits-sheet')).toBeNull()
  })

  it('Copy summary writes the text summary — honesty line last — to the clipboard and confirms', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderTool({ initialCheck: check() })
    fireEvent.click(screen.getByText('Copy summary'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const text = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(text).toContain('Insurance benefits — Mia Hayes')
    expect(text).toContain('Left this year: $880 left (of $1,500 · $620 used)')
    expect(text.trim().split('\n').pop()).toMatch(/not a real payer check/i)
    await waitFor(() => expect(screen.getByText('Copied ✓')).toBeTruthy())
  })

  it('Print sheet hands the page to the printer', () => {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { value: print, configurable: true })
    renderTool({ initialCheck: check() })
    fireEvent.click(screen.getByText('🖨 Print sheet'))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('the recent list filters by status chip and narrows by a patient or payer search', () => {
    const rows = [
      check({ id: 'a', patientName: 'Mia Hayes' }),
      check({ id: 'b', patientName: 'Noah Park', status: 'inactive', input: { ...check().input, carrierName: 'Cigna' }, result: { ...check().result!, status: 'inactive', payerName: 'Cigna' } }),
      check({ id: 'c', patientName: 'Emma Li', status: 'not_found', result: null }),
    ]
    renderTool({ recent: rows })
    expect(screen.getByText(/last 3/)).toBeTruthy()
    const rowButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('li > button'))
    expect(rowButtons()).toHaveLength(3)
    // The chip, not the row's status pill: a FilterChip is the button carrying aria-pressed.
    const chip = screen.getAllByText('Not active').map((el) => el.closest('button')).find((b) => b?.hasAttribute('aria-pressed'))!
    fireEvent.click(chip)
    expect(rowButtons()).toHaveLength(1)
    expect(rowButtons()[0].textContent).toContain('Noah Park')
    fireEvent.click(screen.getByText('All'))
    expect(rowButtons()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Search recent checks'), { target: { value: 'cigna' } })
    expect(rowButtons()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Search recent checks'), { target: { value: 'zzz' } })
    expect(rowButtons()).toHaveLength(0)
    expect(screen.getByText('Nothing matches that filter.')).toBeTruthy()
  })
})

describe('InsuranceTool — scan a card', () => {
  beforeEach(() => {
    scanCardAction.mockReset()
    uploadFileWithProgress.mockClear()
  })

  it('uploads the photo, reads it, fills carrier / member id / group as a PREFILL, shows the hints, and never runs a check', async () => {
    scanCardAction.mockResolvedValue({ ok: true, fields: { provider: 'Delta Dental of California', memberId: 'DD-77', groupNumber: 'G-9', planName: 'Delta PPO', subscriberName: 'Ana Hayes' }, attached: 0 })
    renderTool()
    const input = screen.getByLabelText('Photo of the insurance card') as HTMLInputElement
    const file = new File(['x'], 'front.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(scanCardAction).toHaveBeenCalledTimes(1))
    expect(uploadFileWithProgress).toHaveBeenCalledWith(file, 'insurance-cards', expect.any(Function))
    expect(scanCardAction).toHaveBeenCalledWith({ images: [{ url: 'https://storage.test/insurance-cards/front.jpg', name: 'front.jpg', contentType: 'image/jpeg', sizeBytes: 1 }], patientId: null })
    await waitFor(() => expect(screen.getByText(/We read what we could/)).toBeTruthy())
    expect((screen.getByLabelText('Carrier') as HTMLInputElement).value).toBe('Delta Dental of California')
    expect((screen.getByLabelText('Member ID') as HTMLInputElement).value).toBe('DD-77')
    expect((screen.getByLabelText('Group # (optional)') as HTMLInputElement).value).toBe('G-9')
    expect(screen.getByTestId('card-hints').textContent).toContain('plan: Delta PPO')
    expect(screen.getByTestId('card-hints').textContent).toContain('subscriber: Ana Hayes')
    expect(checkInsuranceAction).not.toHaveBeenCalled()
  })

  it('a field the card did not show is left alone; a refusal is shown in the desk’s words', async () => {
    renderTool({ prefill: { patientId: 'pat_1', patientName: 'Mia Hayes', request: check().input } })
    scanCardAction.mockResolvedValueOnce({ ok: true, fields: { provider: null, memberId: 'NEW-1', groupNumber: null, planName: null, subscriberName: null }, attached: 1 })
    fireEvent.change(screen.getByLabelText('Photo of the insurance card'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByText(/The photo is on their record/)).toBeTruthy())
    expect((screen.getByLabelText('Carrier') as HTMLInputElement).value).toBe('Delta Dental')
    expect((screen.getByLabelText('Member ID') as HTMLInputElement).value).toBe('NEW-1')
    expect(scanCardAction).toHaveBeenLastCalledWith(expect.objectContaining({ patientId: 'pat_1' }))
    scanCardAction.mockResolvedValueOnce({ ok: false, error: 'We couldn’t read that card. Type it in from the card instead.' })
    fireEvent.change(screen.getByLabelText('Photo of the insurance card'), { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/couldn’t read that card/))
  })

  it('refuses a non-image before uploading anything', async () => {
    renderTool()
    fireEvent.change(screen.getByLabelText('Photo of the insurance card'), { target: { files: [new File(['x'], 'card.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Pick a photo/))
    expect(uploadFileWithProgress).not.toHaveBeenCalled()
    expect(scanCardAction).not.toHaveBeenCalled()
  })
})

describe('the release (polish phase 6): readiness and the allowance', () => {
  it('with no practice NPI under the live driver, the form is parked behind a readiness notice that links to the Business profile', () => {
    renderTool({ driver: 'stedi', needsNpi: true })
    const notice = screen.getByTestId('insurance-readiness')
    expect(notice).toHaveTextContent('Add your practice NPI to start checking')
    const cta = screen.getByText('Add the NPI in Settings →')
    expect(cta.closest('a')?.getAttribute('href')).toBe('/settings/clinic')
    expect(screen.getByRole('button', { name: 'Check benefits' })).toBeDisabled()
  })

  it('ready: no notice, the check button live', () => {
    renderTool({ driver: 'stedi', needsNpi: false })
    expect(screen.queryByTestId('insurance-readiness')).toBeNull()
    expect(screen.getByRole('button', { name: 'Check benefits' })).not.toBeDisabled()
  })

  it('the header says which NPI the checks go out under, with the door to change it (the first client could not find it)', () => {
    const { unmount } = renderTool({ driver: 'stedi', npi: '1234567890' })
    const line = screen.getByTestId('insurance-npi')
    expect(line).toHaveTextContent('Checking under NPI ···7890')
    expect(line.textContent).not.toContain('123456')
    expect(screen.getByText('Change').closest('a')?.getAttribute('href')).toBe('/settings/clinic#npi')
    unmount()
    // Test mode asks a payer too; the sandbox never sees an NPI; no NPI means the readiness notice speaks instead.
    const t = renderTool({ driver: 'stedi_test', npi: '1234567890' })
    expect(screen.getByTestId('insurance-npi')).toBeInTheDocument()
    t.unmount()
    const s = renderTool({ driver: 'sandbox', npi: '1234567890' })
    expect(screen.queryByTestId('insurance-npi')).toBeNull()
    s.unmount()
    renderTool({ driver: 'stedi', npi: null, needsNpi: true })
    expect(screen.queryByTestId('insurance-npi')).toBeNull()
  })

  it('under the live driver the header says where the month stands, in mono; spent reads in the warn tone', () => {
    const { unmount } = renderTool({ driver: 'stedi', usage: { used: 12, included: 200, unreadable: false } })
    const line = screen.getByTestId('insurance-usage')
    expect(line).toHaveTextContent('12 of 200 checks used this month')
    expect(line.className).toContain('font-mono-num')
    expect(line.className).not.toContain('amber')
    unmount()
    renderTool({ driver: 'stedi', usage: { used: 200, included: 200, unreadable: false } })
    expect(screen.getByTestId('insurance-usage')).toHaveTextContent('All 200 included checks used this month')
    expect(screen.getByTestId('insurance-usage').className).toContain('amber')
  })

  it('free drivers show no counter, and an unreadable count hides it rather than lying', () => {
    const { unmount } = renderTool({ driver: 'sandbox', usage: null })
    expect(screen.queryByTestId('insurance-usage')).toBeNull()
    unmount()
    renderTool({ driver: 'stedi', usage: { used: 0, included: 200, unreadable: true } })
    expect(screen.queryByTestId('insurance-usage')).toBeNull()
  })
})

describe('the ON switch (self-serve setup)', () => {
  it('only an owner/admin sees "Turn off insurance checks", and it asks before it acts', async () => {
    const { unmount } = renderTool({ canManage: false })
    expect(screen.queryByText('Turn off insurance checks')).toBeNull()
    unmount()
    renderTool({ canManage: true })
    confirmFn.mockResolvedValueOnce(false)
    fireEvent.click(screen.getByText('Turn off insurance checks'))
    await waitFor(() => expect(confirmFn).toHaveBeenCalledTimes(1))
    expect(disableInsuranceAction).not.toHaveBeenCalled()
    confirmFn.mockResolvedValueOnce(true)
    fireEvent.click(screen.getByText('Turn off insurance checks'))
    await waitFor(() => expect(disableInsuranceAction).toHaveBeenCalledTimes(1))
  })
})
