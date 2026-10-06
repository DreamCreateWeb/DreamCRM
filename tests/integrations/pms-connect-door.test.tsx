import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE PMS FRONT DOOR (docs/ACTIVATION.md S4, laws 2 + 3). Unconnected and
 * unasked: the intro + ONE form, prefilled with the signed-in person, whose
 * submit calls the action and refreshes. Asked: the status card in the
 * feature's own words with what the clinic told us and a way to update it.
 * A member reads who can ask.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const submit = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/integrations/actions', () => ({ submitPmsConnectRequestAction: (...a: unknown[]) => submit(...(a as [])) }))

import PmsConnectRequest from '@/app/(default)/integrations/pms/connect-request'
import { PMS_CONNECT_INTRO } from '@/lib/pms-connect'

const requested = {
  vendor: 'eaglesoft',
  vendorName: null,
  practiceNameInPms: 'Smiles PC',
  contactName: 'Ada Reyes',
  contactEmail: 'ada@example.com',
  contactPhone: null,
  bestTime: 'morning',
  notes: null,
  status: 'requested' as const,
  updatedAtIso: '2026-10-12T15:00:00.000Z',
}

beforeEach(() => {
  refresh.mockClear()
  submit.mockClear()
})

describe('PmsConnectRequest', () => {
  it('unasked: the intro and one form, prefilled with the signed-in person; submit → action → refresh', async () => {
    render(<PmsConnectRequest request={null} canManage defaultContactName="Dana" defaultContactEmail="dana@clinic.com" />)
    for (const line of PMS_CONNECT_INTRO.does) expect(screen.getByText(line)).toBeInTheDocument()
    const form = screen.getByTestId('pms-connect-form')
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Dana')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('dana@clinic.com')
    expect(screen.queryByTestId('pms-connect-status')).toBeNull()
    fireEvent.change(screen.getByLabelText('Practice software'), { target: { value: 'open_dental' } })
    fireEvent.submit(form)
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const fd = submit.mock.calls[0][0] as unknown as FormData
    expect(fd.get('vendor')).toBe('open_dental')
    expect(fd.get('contactEmail')).toBe('dana@clinic.com')
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('"other" opens the name box; a refused submit renders its reasons inline', async () => {
    submit.mockResolvedValueOnce({ ok: false, issues: [{ field: 'contactEmail', message: 'An email we can reach them at.' }] } as never)
    render(<PmsConnectRequest request={null} canManage defaultContactName={null} defaultContactEmail={null} />)
    fireEvent.change(screen.getByLabelText('Practice software'), { target: { value: 'other' } })
    expect(screen.getByLabelText('What is it called?')).toBeInTheDocument()
    fireEvent.submit(screen.getByTestId('pms-connect-form'))
    expect(await screen.findByRole('alert')).toHaveTextContent('An email we can reach them at.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('asked: the status card says we are connecting it, shows what they told us, and can be updated', () => {
    render(<PmsConnectRequest request={requested} canManage defaultContactName={null} defaultContactEmail={null} />)
    const card = screen.getByTestId('pms-connect-status')
    expect(card).toHaveTextContent('We’re connecting it')
    expect(card).toHaveTextContent(/hear from Dustin within a day/)
    expect(card).toHaveTextContent('Eaglesoft')
    expect(card).toHaveTextContent('Smiles PC')
    expect(card).toHaveTextContent('Ada Reyes · ada@example.com')
    expect(card).toHaveTextContent('Mornings')
    expect(screen.queryByTestId('pms-connect-form')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Update what you told us/ }))
    expect(screen.getByTestId('pms-connect-form')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update the request' })).toBeInTheDocument()
  })

  it('a member reads who can ask, and sees no form', () => {
    render(<PmsConnectRequest request={null} canManage={false} defaultContactName={null} defaultContactEmail={null} />)
    expect(screen.getByText(PMS_CONNECT_INTRO.askManager)).toBeInTheDocument()
    expect(screen.queryByTestId('pms-connect-form')).toBeNull()
  })
})
