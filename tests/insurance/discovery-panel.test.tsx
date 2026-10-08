import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

/**
 * The no-card panel in the DOM: the confirm names the cost BEFORE the
 * action runs and a "no" runs nothing; the SSN box is cleared the moment
 * the search returns; candidate cards carry the honesty line, the status
 * word, the dental mark and the matched name; "Use this card" hands the
 * card up; a pending search offers "Check for results"; test mode shows
 * the live-only sentence and no form; the sandbox wears the practice pill.
 */

const toast = vi.fn()
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))
const confirmFn = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmFn }))
const discoverCoverageAction = vi.fn(async (..._a: unknown[]) => ({ ok: false, errors: { _form: 'not set' } }) as unknown)
const resumeDiscoveryAction = vi.fn(async (..._a: unknown[]) => ({ ok: false, errors: { _form: 'not set' } }) as unknown)
vi.mock('@/app/(default)/insurance/actions', () => ({
  discoverCoverageAction: (...a: unknown[]) => discoverCoverageAction(...a),
  resumeDiscoveryAction: (...a: unknown[]) => resumeDiscoveryAction(...a),
}))

import { DiscoveryPanel } from '@/app/(default)/insurance/discovery-panel'
import { DISCOVERY_COPY, type DiscoveryCandidate, type InsuranceDiscoveryView } from '@/lib/insurance-discovery'

const SEED = { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: 'AR', postalCode: '72554' }

function candidate(over: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    payerName: 'Delta Dental of California',
    payerId: '77777',
    payorIdentification: '77777',
    memberId: 'DD-100',
    groupNumber: 'G-1',
    planName: 'Delta Dental PPO',
    planBegin: '2026-01-01',
    planEnd: null,
    status: 'active',
    dental: true,
    relationship: 'self',
    subscriber: null,
    matchedName: 'MIA HAYES',
    matchedDateOfBirth: '1988-03-12',
    confidence: 'REVIEW_NEEDED',
    ...over,
  }
}

function view(over: Partial<InsuranceDiscoveryView> = {}): InsuranceDiscoveryView {
  return {
    id: 'disc_1',
    patientId: 'pat_1',
    driver: 'stedi',
    status: 'found',
    input: { ...SEED, hasSsn: true },
    candidates: [candidate()],
    coveragesFound: 1,
    discoveryId: 'disc-abc',
    error: null,
    requestedByName: 'Dana Whitfield',
    createdAtIso: '2026-10-08T15:00:00.000Z',
    ...over,
  }
}

function renderPanel(props: Partial<React.ComponentProps<typeof DiscoveryPanel>> = {}) {
  const onUse = vi.fn()
  const onClose = vi.fn()
  const utils = render(<DiscoveryPanel driver="stedi" usage={{ used: 3, included: 20, unreadable: false }} patientId="pat_1" seed={SEED} initial={null} onUse={onUse} onClose={onClose} {...props} />)
  return { ...utils, onUse, onClose }
}

beforeEach(() => {
  toast.mockClear()
  confirmFn.mockReset()
  confirmFn.mockResolvedValue(true)
  discoverCoverageAction.mockReset()
  resumeDiscoveryAction.mockReset()
})
afterEach(cleanup)

describe('DiscoveryPanel — asking', () => {
  it('prefills state + ZIP from the record, shows the allowance, and the SSN hint says it is never kept', () => {
    renderPanel()
    expect((screen.getByLabelText(DISCOVERY_COPY.stateLabel) as HTMLInputElement).value).toBe('AR')
    expect((screen.getByLabelText(DISCOVERY_COPY.zipLabel) as HTMLInputElement).value).toBe('72554')
    expect(screen.getByTestId('discovery-usage').textContent).toBe('3 of 20 searches used this month')
    expect(screen.getByText(DISCOVERY_COPY.ssnHint)).toBeTruthy()
    expect(screen.queryByText('Practice answer')).toBeNull()
  })

  it('confirms with the cost first; a "no" runs nothing', async () => {
    confirmFn.mockResolvedValue(false)
    renderPanel()
    fireEvent.click(screen.getByText(DISCOVERY_COPY.find))
    await waitFor(() => expect(confirmFn).toHaveBeenCalledTimes(1))
    const opts = (confirmFn.mock.calls[0] as unknown as [{ title: string; message: string; confirmLabel: string }])[0]
    expect(opts.title).toBe(DISCOVERY_COPY.confirmTitle)
    expect(opts.message).toContain('3 of 20')
    expect(opts.message).toContain('costs more than a check')
    expect(discoverCoverageAction).not.toHaveBeenCalled()
  })

  it('a "yes" sends the ask with the SSN, then clears the SSN box and shows the cards', async () => {
    discoverCoverageAction.mockResolvedValue({ ok: true, discovery: view() })
    const { onUse } = renderPanel()
    fireEvent.change(screen.getByLabelText(DISCOVERY_COPY.ssnLabel), { target: { value: '123-45-6789' } })
    fireEvent.click(screen.getByText(DISCOVERY_COPY.find))
    await waitFor(() => expect(discoverCoverageAction).toHaveBeenCalledTimes(1))
    expect(discoverCoverageAction.mock.calls[0]).toEqual([{ ...SEED, ssn: '123-45-6789' }, 'pat_1'])
    await screen.findByTestId('discovery-candidates')
    expect((screen.getByLabelText(DISCOVERY_COPY.ssnLabel) as HTMLInputElement).value).toBe('')
    expect(screen.getByText('1 possible plan')).toBeTruthy()
    expect(screen.getByText(DISCOVERY_COPY.honesty)).toBeTruthy()
    expect(screen.getByText('Active').getAttribute('data-tone')).toBe('ok')
    expect(screen.getByText('Dental').getAttribute('data-tone')).toBe('ok')
    expect(screen.getByText('DD-100')).toBeTruthy()
    expect(screen.getByText(/MIA HAYES/)).toBeTruthy()
    expect(screen.getByText('Searched by Dana Whitfield')).toBeTruthy()
    fireEvent.click(screen.getByText(DISCOVERY_COPY.use))
    expect(onUse).toHaveBeenCalledWith(candidate(), { ...SEED, hasSsn: true })
  })

  it('a refusal lands as the form error and a toast; a missing name points at the form above', async () => {
    discoverCoverageAction.mockResolvedValue({ ok: false, reason: 'over_allowance', errors: { _form: '20 of 20 searches used' } })
    renderPanel()
    fireEvent.click(screen.getByText(DISCOVERY_COPY.find))
    await screen.findByText('20 of 20 searches used')
    expect(toast).toHaveBeenCalledWith('20 of 20 searches used', { tone: 'urgent' })
    cleanup()
    renderPanel({ seed: { ...SEED, firstName: '' } })
    fireEvent.click(screen.getByText(DISCOVERY_COPY.find))
    await screen.findByText('Fill in their name and date of birth above first.')
    expect(confirmFn).toHaveBeenCalledTimes(1)
  })

  it('the live driver with no NPI parks the button', () => {
    renderPanel({ disabled: true })
    expect((screen.getByText(DISCOVERY_COPY.find).closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('DiscoveryPanel — answers', () => {
  it('an ended dependent card says whose name the policy is in, with warn tone', () => {
    renderPanel({
      initial: view({
        candidates: [candidate({ status: 'inactive', dental: false, planEnd: '2025-12-31', relationship: 'dependent', subscriber: { firstName: 'John', lastName: 'Hayes', dateOfBirth: '1985-01-01' } })],
      }),
    })
    expect(screen.getByText('Ended').getAttribute('data-tone')).toBe('warn')
    expect(screen.getByText('No dental seen').getAttribute('data-tone')).toBe('neutral')
    expect(screen.getByText(/Policy in John Hayes’s name/)).toBeTruthy()
    expect(screen.getByText(/Jan 1, 2026 – Dec 31, 2025/)).toBeTruthy()
  })

  it('nothing found and an error each say so plainly', () => {
    renderPanel({ initial: view({ status: 'none', candidates: [], coveragesFound: 0 }) })
    expect(screen.getByText(DISCOVERY_COPY.none)).toBeTruthy()
    cleanup()
    renderPanel({ initial: view({ status: 'error', candidates: [], coveragesFound: 0, error: 'Stedi is busy' }) })
    expect(screen.getByText('Stedi is busy')).toBeTruthy()
  })

  it('a pending search offers "Check for results", which resumes it', async () => {
    resumeDiscoveryAction.mockResolvedValueOnce({ ok: true, discovery: view({ status: 'pending', candidates: [] }) }).mockResolvedValueOnce({ ok: true, discovery: view() })
    renderPanel({ initial: view({ status: 'pending', candidates: [], coveragesFound: 0 }) })
    expect(screen.getByText(DISCOVERY_COPY.pending)).toBeTruthy()
    fireEvent.click(screen.getByText(DISCOVERY_COPY.checkAgain))
    await waitFor(() => expect(resumeDiscoveryAction).toHaveBeenCalledWith('disc_1'))
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Still searching — the payers haven’t all answered yet.'))
    fireEvent.click(screen.getByText(DISCOVERY_COPY.checkAgain))
    await screen.findByTestId('discovery-candidates')
    expect(screen.queryByText(DISCOVERY_COPY.checkAgain)).toBeNull()
  })

  it('test mode shows only the live-only sentence; the sandbox wears the practice pill and a free confirm', async () => {
    renderPanel({ driver: 'stedi_test', usage: null })
    expect(screen.getByTestId('discovery-live-only').textContent).toBe(DISCOVERY_COPY.liveOnly)
    expect(screen.queryByText(DISCOVERY_COPY.find)).toBeNull()
    cleanup()
    renderPanel({ driver: 'sandbox', usage: null, initial: view({ driver: 'sandbox' }) })
    expect(screen.getByText('Practice answer').getAttribute('title')).toBe(DISCOVERY_COPY.practice)
    expect(screen.getByText('· practice answer')).toBeTruthy()
    fireEvent.click(screen.getByText(DISCOVERY_COPY.find))
    await waitFor(() => expect(confirmFn).toHaveBeenCalled())
    expect((confirmFn.mock.calls[0] as unknown as [{ message: string }])[0].message).toContain('nothing goes to a payer')
  })
})
