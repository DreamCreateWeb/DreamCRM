import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The patient record's Consent card (ML-31): the states in words, the
 * "Record a change" form, and the law that the writer is the consent spine.
 */

const record = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }))
vi.mock('@/app/(default)/patients/actions', () => ({
  recordMarketingConsentAction: (...a: unknown[]) => record(...a),
}))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import ConsentCard, { consentLines } from '@/app/(default)/patients/[id]/consent-card'
import type { PatientConsentView } from '@/lib/types/patient-consent'

const base: PatientConsentView = {
  emailOn: true,
  emailOnAtIso: '2026-03-03T18:00:00Z',
  emailOffAtIso: null,
  smsOn: false,
  smsOnAtIso: null,
  smsOffAtIso: null,
  source: 'booking',
}
const TZ = 'America/Chicago'

beforeEach(() => {
  record.mockClear()
  refresh.mockClear()
})

describe('consentLines', () => {
  it('email on, with the date and the source', () => {
    expect(consentLines(base, TZ).email).toBe('On since Mar 3, 2026 (website booking)')
  })

  it('email on with no date on file is just On', () => {
    expect(consentLines({ ...base, emailOnAtIso: null }, TZ).email).toBe('On')
  })

  it('email off says since when', () => {
    const c = { ...base, emailOn: false, emailOffAtIso: '2026-05-01T12:00:00Z' }
    expect(consentLines(c, TZ).email).toBe('Off since May 1, 2026')
  })

  it('texts: nothing on file, on file, and opted out — never a promise to send', () => {
    expect(consentLines(base, TZ).texts).toBe('No text consent on file')
    const on = { ...base, smsOn: true, smsOnAtIso: '2026-06-10T15:00:00Z', source: 'staff' }
    expect(consentLines(on, TZ).texts).toBe('Text consent on file since Jun 10, 2026 (told to staff)')
    const off = { ...base, smsOffAtIso: '2026-07-01T15:00:00Z' }
    expect(consentLines(off, TZ).texts).toBe('Opted out of texts since Jul 1, 2026')
    for (const t of [consentLines(base, TZ).texts, consentLines(on, TZ).texts, consentLines(off, TZ).texts]) {
      expect(t).not.toMatch(/coming|soon|we.ll text|will send|isn.t on yet/i)
    }
  })

  it('shows the source on the channel it belongs to (the later opt-in)', () => {
    const c = { ...base, smsOn: true, smsOnAtIso: '2026-06-10T15:00:00Z', source: 'keyword' }
    const l = consentLines(c, TZ)
    expect(l.email).toBe('On since Mar 3, 2026')
    expect(l.texts).toContain('(text reply)')
  })
})

describe('ConsentCard', () => {
  it('renders both rows and the one action', () => {
    render(<ConsentCard patientId="pat_1" consent={base} timeZone={TZ} />)
    expect(screen.getByText('Email marketing')).toBeTruthy()
    expect(screen.getByText('No text consent on file')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record a change' })).toBeTruthy()
  })

  it('saves a change through the action (with the chosen channel, answer and source) and refreshes', async () => {
    render(<ConsentCard patientId="pat_1" consent={base} timeZone={TZ} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record a change' }))
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'sms' } })
    fireEvent.change(screen.getByLabelText('They now say'), { target: { value: 'on' } })
    fireEvent.change(screen.getByLabelText('Where it came from'), { target: { value: 'intake' } })
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'asked at checkout' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(record).toHaveBeenCalled())
    expect(record).toHaveBeenCalledWith('pat_1', { channel: 'sms', on: true, source: 'intake', note: 'asked at checkout' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows the action’s refusal in words and keeps the form open', async () => {
    record.mockResolvedValueOnce({ ok: false, error: 'Add a mobile number to the record first.' } as never)
    render(<ConsentCard patientId="pat_1" consent={base} timeZone={TZ} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record a change' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Add a mobile number')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('a thrown action (deployment skew) becomes a message, not a frozen button', async () => {
    record.mockRejectedValueOnce(new Error('boom'))
    render(<ConsentCard patientId="pat_1" consent={base} timeZone={TZ} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record a change' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('the writer is the consent spine', () => {
  it('the action delegates to lib/services/sms-consent.ts and writes no consent column itself', () => {
    const actions = readFileSync(join(process.cwd(), 'app/(default)/patients/actions.ts'), 'utf8')
    expect(actions).toContain("recordStaffConsentChange")
    expect(actions).toContain("from '@/lib/services/sms-consent'")
    expect(actions).not.toMatch(/marketingSmsOptIn\s*:|marketingEmailOptIn\s*:/)
    const svc = readFileSync(join(process.cwd(), 'lib/services/sms-consent.ts'), 'utf8')
    expect(svc).toContain('export async function recordEmailOptOut')
    expect(svc).toContain('export async function recordEmailOptIn')
  })
})
