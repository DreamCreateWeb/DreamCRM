import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EmailsHub from '@/app/(default)/settings/automations/emails/emails-hub'
import { resolveEmailAutomations } from '@/lib/types/email-automations'
import { REMINDER_DEFAULTS } from '@/lib/types/reminders'

/**
 * The hub preview shows the email a patient gets — greeting included or not.
 * The sender adds "Hi {first}," only when the message doesn't already open
 * with one, and the preview follows the same rule, so staff never see a
 * single greeting on screen and send a doubled one.
 */

vi.mock('@/app/(default)/settings/automations/emails/actions', () => ({
  saveEmailAutomationAction: vi.fn(async () => ({ ok: true as const })),
  saveReminderSettingsAction: vi.fn(async () => ({ ok: true as const })),
}))

beforeEach(() => {
  document.body.innerHTML = ''
})

function previewGreeting(): HTMLElement | null {
  return document.querySelector('[data-preview-greeting]')
}

describe('EmailsHub preview greeting line', () => {
  it('a default that opens "Hi {{firstName}}" shows no second greeting', () => {
    render(
      <EmailsHub config={resolveEmailAutomations(null)} reminder={REMINDER_DEFAULTS} canManage focusKey="contact_ack" />,
    )
    expect(previewGreeting()).toBeNull()
    // The body still reads with its own greeting, once.
    const hits = Array.from(document.querySelectorAll('p')).filter((p) => /^Hi Jordan/.test(p.textContent ?? ''))
    expect(hits).toHaveLength(1)
  })

  it('a clinic that trimmed the greeting from its message sees the one the sender adds', () => {
    const config = resolveEmailAutomations({
      contact_ack: { body: 'We got your message and will reach out within one business day.' },
    })
    render(<EmailsHub config={config} reminder={REMINDER_DEFAULTS} canManage focusKey="contact_ack" />)
    expect(previewGreeting()?.textContent).toMatch(/^Hi Jordan,/)
  })

  it('the line follows the message live as staff type', () => {
    render(
      <EmailsHub config={resolveEmailAutomations(null)} reminder={REMINDER_DEFAULTS} canManage focusKey="contact_ack" />,
    )
    const body = screen.getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'Thanks — we will be in touch within one business day.' } })
    expect(previewGreeting()?.textContent).toMatch(/^Hi Jordan,/)
    fireEvent.change(body, { target: { value: 'Hello {{firstName}}, thanks — we will be in touch.' } })
    expect(previewGreeting()).toBeNull()
  })

  it('an email whose sender never greets (the booking confirmation) shows no greeting line', () => {
    render(
      <EmailsHub config={resolveEmailAutomations(null)} reminder={REMINDER_DEFAULTS} canManage focusKey="booking_confirmation" />,
    )
    expect(previewGreeting()).toBeNull()
  })
})
