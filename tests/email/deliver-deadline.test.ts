import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * `deliver()` has a DEADLINE (DREAMCRM-89).
 *
 * Before this, no transport had one: the Gmail token fetch and send, SES and
 * Resend all ran to the default socket timeout. Harmless while every
 * patient-facing caller fired and forgot — #599 put an AWAITED send inside the
 * public booking action (`submitBookingRequest`), so a hung provider became a
 * patient sitting on a spinner after their visit was already committed, and
 * `not_sent` — the state whose copy tells them to save their details — was only
 * reachable at the socket timeout.
 *
 * Every test here drives a transport that NEVER SETTLES. Against the code as it
 * stood before this change each one hangs until vitest's own test timeout
 * (watched: 5 failures, all "Test timed out in 5000ms"), which is the defect
 * stated as a test.
 */
const mocks = vi.hoisted(() => ({
  resendSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
  sesSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
  gmailToken: vi.fn<(id: string) => Promise<string>>(),
  gmailSend: vi.fn<(token: string, msg: unknown) => Promise<unknown>>(),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resendSend }
  },
}))
vi.mock('@/lib/ses', () => ({ sendEmailViaSes: mocks.sesSend }))
vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: mocks.gmailToken,
  sendMessage: mocks.gmailSend,
}))

import { deliver } from '@/lib/email'

/** A promise that never settles — a provider that accepted the socket and went
 *  quiet, which is the failure this deadline exists for. */
function hangs<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

const MSG = { to: 'patient@acmedental.com', subject: 'Your visit', html: '<p>hi</p>' }
const GMAIL = { accountId: 'acct_1', from: 'Acme Dental <frontdesk@acmedental.com>' }

// Short enough to keep the suite fast, long enough that the two-tier split
// (Gmail gets at most half) is still measurable.
const BUDGET_MS = 120

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mocks.resendSend.mockReset()
  mocks.sesSend.mockReset()
  mocks.gmailToken.mockReset().mockResolvedValue('access-tok')
  mocks.gmailSend.mockReset()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_TIMEOUT_MS = String(BUDGET_MS)
  delete process.env.EMAIL_DRIVER
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
  delete process.env.EMAIL_TIMEOUT_MS
})

describe('deliver() deadline', () => {
  it('gives up on a Resend send that never answers, instead of waiting forever', async () => {
    mocks.resendSend.mockImplementation(() => hangs())
    const startedAt = Date.now()

    await expect(deliver({ ...MSG })).rejects.toThrow(/didn’t respond in time/)

    // The point of the fix: bounded, and bounded by the budget rather than by
    // the socket timeout.
    expect(Date.now() - startedAt).toBeLessThan(BUDGET_MS * 6)
  })

  it('gives up on an SES send that never answers', async () => {
    process.env.EMAIL_DRIVER = 'ses'
    mocks.sesSend.mockImplementation(() => hangs())

    await expect(deliver({ ...MSG })).rejects.toThrow(/didn’t respond in time/)
    expect(mocks.sesSend).toHaveBeenCalledOnce()
  })

  it('falls back to the platform sender when the clinic Gmail hangs, and still delivers', async () => {
    mocks.gmailSend.mockImplementation(() => hangs())
    mocks.resendSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null })

    await expect(deliver({ ...MSG, gmail: GMAIL })).resolves.toBeUndefined()

    // A hung Tier-2 mailbox must not swallow the whole budget: the patient
    // still gets the email from the platform sender.
    expect(mocks.resendSend).toHaveBeenCalledOnce()
  })

  it('bounds the WHOLE call when Gmail and the platform sender both hang', async () => {
    mocks.gmailSend.mockImplementation(() => hangs())
    mocks.resendSend.mockImplementation(() => hangs())
    const startedAt = Date.now()

    await expect(deliver({ ...MSG, gmail: GMAIL })).rejects.toThrow(/didn’t respond in time/)

    // One budget for the call, not one per transport — the caller gets a single
    // number it can reason about.
    expect(Date.now() - startedAt).toBeLessThan(BUDGET_MS * 6)
    // Gmail was tried and abandoned, and the fallback got a real attempt.
    expect(mocks.gmailSend).toHaveBeenCalledOnce()
    expect(mocks.resendSend).toHaveBeenCalledOnce()
  })

  it('a hung Gmail TOKEN fetch counts against the same budget and still falls back', async () => {
    mocks.gmailToken.mockImplementation(() => hangs())
    mocks.resendSend.mockResolvedValue({ data: { id: 'msg_2' }, error: null })

    await expect(deliver({ ...MSG, gmail: GMAIL })).resolves.toBeUndefined()

    expect(mocks.gmailSend).not.toHaveBeenCalled()
    expect(mocks.resendSend).toHaveBeenCalledOnce()
  })

  it('does not leave an unhandled rejection when an abandoned send fails later', async () => {
    let rejectLate: (err: unknown) => void = () => {}
    mocks.resendSend.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectLate = reject }),
    )
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      await expect(deliver({ ...MSG })).rejects.toThrow(/didn’t respond in time/)
      // The provider finally answers — with an error — after nobody is waiting.
      rejectLate(new Error('connection reset'))
      await new Promise((r) => setTimeout(r, 30))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('leaves a send that answers promptly completely alone', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'msg_3' }, error: null })
    await expect(deliver({ ...MSG })).resolves.toBeUndefined()
    expect(mocks.resendSend).toHaveBeenCalledOnce()
  })

  it('still surfaces a real provider REJECTION as itself, not as a timeout', async () => {
    mocks.resendSend.mockResolvedValue({ error: { name: 'validation_error', message: 'bad from' } })
    await expect(deliver({ ...MSG })).rejects.toThrow(/couldn’t be sent right now/)
  })
})
