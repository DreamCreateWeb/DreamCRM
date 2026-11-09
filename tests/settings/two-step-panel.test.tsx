import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const enable = vi.fn()
const verifyTotp = vi.fn()
const disable = vi.fn()
const generateBackupCodes = vi.fn()
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    twoFactor: {
      enable: (...a: unknown[]) => enable(...a),
      verifyTotp: (...a: unknown[]) => verifyTotp(...a),
      disable: (...a: unknown[]) => disable(...a),
      generateBackupCodes: (...a: unknown[]) => generateBackupCodes(...a),
    },
  },
  signOut: vi.fn(),
}))
vi.mock('qrcode', () => ({ default: { toString: vi.fn(async () => '<svg></svg>') } }))
const confirmFn = vi.fn(async () => true)
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirmFn }))

import { TwoStepEnrol, TwoStepManage } from '@/components/auth/two-step'

const assign = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', { value: { assign }, writable: true })
})

describe('TwoStepEnrol', () => {
  it('asks the password, shows the key + codes once, gates the code on "I saved them"', async () => {
    enable.mockResolvedValue({
      data: {
        totpURI: 'otpauth://totp/DreamCRM:a@b.c?secret=JBSWY3DPEHPK3PXP&issuer=DreamCRM',
        backupCodes: ['aaaa-1111', 'bbbb-2222'],
      },
      error: null,
    })
    verifyTotp.mockResolvedValue({ data: {}, error: null })
    const onEnrolled = vi.fn()
    render(<TwoStepEnrol onEnrolled={onEnrolled} />)
    fireEvent.change(screen.getByLabelText(/confirm your password/i), { target: { value: 'pw-pw-pw-pw' } })
    fireEvent.click(screen.getByRole('button', { name: /start set-up/i }))
    await screen.findAllByText('aaaa-1111')
    expect(enable).toHaveBeenCalledWith({ password: 'pw-pw-pw-pw' })
    expect(screen.getByLabelText(/code from your authenticator/i)).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/i saved them/i))
    const input = screen.getByLabelText(/code from your authenticator/i)
    expect(input).toBeEnabled()
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /turn on two-step/i }))
    await waitFor(() => expect(onEnrolled).toHaveBeenCalled())
    expect(verifyTotp).toHaveBeenCalledWith({ code: '123456' })
  })

  it('shows a wrong password in words and does not advance', async () => {
    enable.mockResolvedValue({ data: null, error: { message: 'Invalid password' } })
    render(<TwoStepEnrol onEnrolled={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/confirm your password/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /start set-up/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid password')
  })

  it('a thrown call is caught by runAction, not left hanging', async () => {
    enable.mockRejectedValue(new Error('network'))
    render(<TwoStepEnrol onEnrolled={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/confirm your password/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /start set-up/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('TwoStepManage', () => {
  it('disable re-asks the password and awaits the confirm dialog first', async () => {
    disable.mockResolvedValue({ data: { status: true }, error: null })
    render(<TwoStepManage enabled required={false} />)
    fireEvent.click(screen.getByRole('button', { name: /^turn off$/i }))
    fireEvent.change(screen.getByLabelText(/confirm your password/i), { target: { value: 'pw-pw-pw-pw' } })
    fireEvent.click(screen.getByRole('button', { name: /turn off two-step sign-in/i }))
    await waitFor(() => expect(disable).toHaveBeenCalledWith({ password: 'pw-pw-pw-pw' }))
    expect(confirmFn).toHaveBeenCalled()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings/security'))
  })

  it('a declined confirm never calls disable', async () => {
    confirmFn.mockResolvedValueOnce(false)
    render(<TwoStepManage enabled required={false} />)
    fireEvent.click(screen.getByRole('button', { name: /^turn off$/i }))
    fireEvent.change(screen.getByLabelText(/confirm your password/i), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /turn off two-step sign-in/i }))
    await waitFor(() => expect(confirmFn).toHaveBeenCalled())
    expect(disable).not.toHaveBeenCalled()
  })

  it('a required person has no turn-off door', () => {
    render(<TwoStepManage enabled required />)
    expect(screen.queryByRole('button', { name: /^turn off$/i })).toBeNull()
    expect(screen.getByText(/requires two-step sign-in/i)).toBeInTheDocument()
  })

  it('new backup codes are shown once behind the saved gate', async () => {
    generateBackupCodes.mockResolvedValue({ data: { status: true, backupCodes: ['new-1', 'new-2'] }, error: null })
    render(<TwoStepManage enabled required={false} />)
    fireEvent.click(screen.getByRole('button', { name: /new backup codes/i }))
    fireEvent.change(screen.getByLabelText(/confirm your password/i), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /make new codes/i }))
    await screen.findByText('new-1')
    expect(screen.getByRole('button', { name: /^done$/i })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/i saved them/i))
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(screen.queryByText('new-1')).toBeNull()
  })
})
