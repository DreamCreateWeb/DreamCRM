import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
  sesSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
  gmailSend: vi.fn<(token: string, msg: unknown) => Promise<unknown>>(),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resendSend }
  },
}))
vi.mock('@/lib/ses', () => ({ sendEmailViaSes: mocks.sesSend }))
vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: vi.fn(async () => 'access-tok'),
  sendMessage: mocks.gmailSend,
}))

import {
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendIntakeRequestEmail,
  sendCancellationConfirmation,
  sendMagicLinkEmail,
  sendChangeEmailVerification,
  sendNotificationEmail,
} from '@/lib/email'

const FROM = 'Dream Create <Hello@DreamCreateWeb.com>'
const GMAIL_SENDER = {
  name: 'Acme Dental',
  from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
  replyTo: 'front@acmedental.com',
  timeZone: 'America/New_York',
  gmail: { accountId: 'acct_1', from: 'Acme Dental <frontdesk@acmedental.com>' },
}

beforeEach(() => {
  mocks.resendSend.mockReset()
  mocks.sesSend.mockReset()
  mocks.gmailSend.mockReset()
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

describe('sendCancellationConfirmation', () => {
  const CLINIC_SENDER = {
    name: 'Acme Dental',
    from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
    replyTo: 'front@acmedental.com',
    timeZone: 'America/New_York',
  }
  const baseData = {
    patientName: 'Mia Hayes',
    clinicName: 'Acme Dental',
    clinicPhone: '555-1212',
    startTime: new Date('2026-07-01T14:00:00Z'),
    appointmentType: 'cleaning',
  }

  it('composes a warm cancellation email FROM the clinic identity with a rebook link', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'm' }, error: null })
    await sendCancellationConfirmation(
      'mia@example.com',
      { ...baseData, rebookUrl: 'https://acme.dreamcreatestudio.com/book' },
      CLINIC_SENDER,
    )
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    const msg = mocks.resendSend.mock.calls[0]![0] as { from: string; to: string; replyTo?: string; subject: string; html: string }
    expect(msg.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
    expect(msg.replyTo).toBe('front@acmedental.com')
    expect(msg.to).toBe('mia@example.com')
    expect(msg.subject).toMatch(/cancelled/i)
    expect(msg.html).toContain('Mia Hayes')
    // Rebook CTA present + points at the public /book page.
    expect(msg.html).toContain('https://acme.dreamcreatestudio.com/book')
    expect(msg.html).toMatch(/find a new time/i)
    // Anti-shame voice — no guilt-trip language.
    expect(msg.html.toLowerCase()).not.toContain('you missed')
    expect(msg.html.toLowerCase()).not.toContain('fee')
  })

  it('falls back to call-us copy (no rebook link) when the plan has no online booking', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'm' }, error: null })
    await sendCancellationConfirmation('mia@example.com', { ...baseData, rebookUrl: null }, CLINIC_SENDER)
    const msg = mocks.resendSend.mock.calls[0]![0] as { html: string }
    expect(msg.html).not.toContain('/book')
    expect(msg.html).toContain('555-1212') // "give us a call at …"
  })
})

describe('sendMagicLinkEmail — clinic branding vs platform fallback', () => {
  const CLINIC_SENDER = {
    name: 'Acme Dental',
    from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
    replyTo: 'front@acmedental.com',
    timeZone: 'America/New_York',
  }

  it('wears the clinic brand when a sender is supplied (FROM clinic, subject names clinic)', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'm' }, error: null })
    await sendMagicLinkEmail('mia@example.com', 'https://www.dreamcreatestudio.com/magic?t=abc', CLINIC_SENDER)
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    const msg = mocks.resendSend.mock.calls[0]![0] as { from: string; replyTo?: string; subject: string; html: string }
    expect(msg.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
    expect(msg.replyTo).toBe('front@acmedental.com')
    expect(msg.subject).toBe('Sign in to Acme Dental')
    expect(msg.html).toContain('Acme Dental')
    expect(msg.html).toContain('https://www.dreamcreatestudio.com/magic?t=abc')
  })

  it('routes through the clinic Gmail account (Tier 2) when present', async () => {
    mocks.gmailSend.mockResolvedValue({ id: 'g1', threadId: 't1' })
    await sendMagicLinkEmail('mia@example.com', 'https://x/magic', {
      ...CLINIC_SENDER,
      gmail: { accountId: 'acct_1', from: 'Acme Dental <frontdesk@acmedental.com>' },
    })
    expect(mocks.gmailSend).toHaveBeenCalledOnce()
    expect(mocks.resendSend).not.toHaveBeenCalled()
  })

  it('falls back to platform-branded copy when NO sender is supplied', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'm' }, error: null })
    await sendMagicLinkEmail('staff@dreamcreateweb.com', 'https://x/magic')
    const msg = mocks.resendSend.mock.calls[0]![0] as { from: string; subject: string; html: string }
    expect(msg.from).toBe(FROM)
    expect(msg.subject).toBe('Your sign-in link')
    // Platform copy, not the clinic-branded headline.
    expect(msg.subject).not.toMatch(/Sign in to /)
  })
})

describe('sendNotificationEmail — staff action CTA', () => {
  it('renders a custom linkLabel button pointing at an absolute deep-link', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'm' }, error: null })
    await sendNotificationEmail({
      to: 'staff@acmedental.com',
      name: 'Dr. Reyes',
      title: 'New online booking — Sarah Lee, Mar 5',
      body: 'cleaning requested via your website.',
      linkPath: '/patients/pat_42',
      linkLabel: 'View Sarah’s record →',
    })
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    const msg = mocks.resendSend.mock.calls[0]![0] as { to: string; html: string }
    expect(msg.to).toBe('staff@acmedental.com')
    // The button text is the specific action, not the generic default …
    expect(msg.html).toContain('View Sarah’s record →')
    expect(msg.html).not.toContain('Open in DreamCRM')
    // … and the href is the absolute patient-record URL.
    expect(msg.html).toContain('href="https://dreamcreatestudio.com/patients/pat_42"')
  })

  it('falls back to the generic "Open in DreamCRM" label when none is given', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'm' }, error: null })
    await sendNotificationEmail({
      to: 'staff@acmedental.com',
      name: null,
      title: 'A sync needs your attention',
      body: '',
      linkPath: '/integrations',
    })
    const msg = mocks.resendSend.mock.calls[0]![0] as { html: string }
    expect(msg.html).toContain('Open in DreamCRM')
    expect(msg.html).toContain('href="https://dreamcreatestudio.com/integrations"')
  })
})

describe('sendChangeEmailVerification — confirm to the OLD mailbox', () => {
  it('sends the confirmation to the current address and names the new one', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'm' }, error: null })
    await sendChangeEmailVerification('old@x.com', 'new@y.com', 'https://app/verify?token=t')
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    const msg = mocks.resendSend.mock.calls[0]![0] as { from: string; to: string; subject: string; html: string }
    // Goes to the OLD email (the security gate), from the platform identity.
    expect(msg.to).toBe('old@x.com')
    expect(msg.from).toBe(FROM)
    expect(msg.subject).toMatch(/confirm/i)
    // Names the requested new address + carries the confirm link.
    expect(msg.html).toContain('new@y.com')
    expect(msg.html).toContain('https://app/verify?token=t')
  })
})

describe('Tier 2 — send via the clinic Gmail account', () => {
  it('routes through the Gmail API (as the clinic address) and skips Resend', async () => {
    mocks.gmailSend.mockResolvedValue({ id: 'g1', threadId: 't1' })
    await sendIntakeRequestEmail(
      'mia@example.com',
      { patientFirstName: 'Mia', clinicName: 'Acme Dental', intakeFormUrl: 'https://x/intake/f' },
      GMAIL_SENDER,
    )
    expect(mocks.gmailSend).toHaveBeenCalledOnce()
    expect(mocks.gmailSend).toHaveBeenCalledWith(
      'access-tok',
      expect.objectContaining({
        from: 'Acme Dental <frontdesk@acmedental.com>',
        to: ['mia@example.com'],
        bodyHtml: expect.stringContaining('intake form'),
      }),
    )
    expect(mocks.resendSend).not.toHaveBeenCalled()
  })

  it('falls back to the platform sender (Resend) when the Gmail send fails', async () => {
    mocks.gmailSend.mockRejectedValue(new Error('invalid_grant'))
    await sendIntakeRequestEmail(
      'mia@example.com',
      { patientFirstName: 'Mia', clinicName: 'Acme Dental', intakeFormUrl: 'https://x/intake/f' },
      GMAIL_SENDER,
    )
    expect(mocks.gmailSend).toHaveBeenCalledOnce()
    // The patient still gets the email — from the clinic-named platform address.
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    expect(mocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Acme Dental <acme-dental@dreamcreatestudio.com>', to: 'mia@example.com' }),
    )
  })
})
