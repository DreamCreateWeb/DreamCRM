import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
  sesSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resendSend }
  },
}))
vi.mock('@/lib/ses', () => ({ sendEmailViaSes: mocks.sesSend }))

import { sendPasswordResetEmail, sendInvitationEmail } from '@/lib/email'

const FROM = 'Dream Create <Hello@DreamCreateWeb.com>'

beforeEach(() => {
  mocks.resendSend.mockReset()
  mocks.sesSend.mockReset()
  process.env.RESEND_API_KEY = 'test-key'
  delete process.env.EMAIL_DRIVER
})

describe('transactional email driver dispatch', () => {
  it('sends via Resend by default', async () => {
    await sendPasswordResetEmail('u@x.com', 'https://reset')
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    expect(mocks.sesSend).not.toHaveBeenCalled()
    expect(mocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: FROM,
        to: 'u@x.com',
        subject: expect.stringMatching(/reset/i),
        html: expect.stringContaining('Reset password'),
      })
    )
  })

  it('routes to SES when EMAIL_DRIVER=ses, preserving from/to/subject/html', async () => {
    process.env.EMAIL_DRIVER = 'ses'
    await sendInvitationEmail('u@x.com', {
      inviterName: 'Dr. Reyes',
      orgName: 'Acme Dental',
      role: 'admin',
      inviteUrl: 'https://invite',
    })
    expect(mocks.sesSend).toHaveBeenCalledOnce()
    expect(mocks.resendSend).not.toHaveBeenCalled()
    expect(mocks.sesSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: FROM,
        to: 'u@x.com',
        subject: expect.stringContaining('Acme Dental'),
        html: expect.stringContaining('Accept invitation'),
      })
    )
  })

  it('still throws if RESEND_API_KEY is missing on the Resend path', async () => {
    delete process.env.RESEND_API_KEY
    await expect(sendPasswordResetEmail('u@x.com', 'https://reset')).rejects.toThrow(/RESEND_API_KEY/)
  })

  it('throws when Resend RETURNS an error object (false-success guard)', async () => {
    // Resend's SDK returns `{ data, error }` and does NOT throw on a bad key /
    // unverified domain. Before the guard, deliver() ignored `error` and the
    // app reported "sent" while nothing was delivered — the exact prod bug.
    mocks.resendSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'API key is invalid' },
    })
    let caught: Error | null = null
    try {
      await sendPasswordResetEmail('u@x.com', 'https://reset')
    } catch (e) {
      caught = e as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toMatch(/couldn.t be sent|test mode/i)
    // The raw provider text must not leak to the caller.
    expect(caught!.message).not.toMatch(/API key/)
  })

  it('maps a raw SES sandbox error to a clean message and never leaks the AWS region text', async () => {
    process.env.EMAIL_DRIVER = 'ses'
    mocks.sesSend.mockRejectedValue(
      Object.assign(
        new Error('Email address is not verified. The following identities failed the check in region US-EAST-1: x@gmail.com'),
        { name: 'MessageRejected' },
      ),
    )
    let caught: Error | null = null
    try {
      await sendInvitationEmail('x@gmail.com', { inviterName: 'A', orgName: 'B', role: 'member', inviteUrl: 'https://i' })
    } catch (e) {
      caught = e as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toMatch(/test mode/i)
    expect(caught!.message).not.toMatch(/US-EAST-1/)
  })
})
