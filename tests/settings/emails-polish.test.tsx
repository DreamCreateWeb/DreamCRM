import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EmailsHub from '@/app/(default)/settings/automations/emails/emails-hub'
import { resolveEmailAutomations } from '@/lib/types/email-automations'
import { REMINDER_DEFAULTS } from '@/lib/types/reminders'

/**
 * Light-polish behaviors on the automated-emails hub: token-chip sample
 * tooltips, reminder hour presets, the "all off" awareness callout, aria
 * wiring, and the higher-fidelity preview. The base card/save behavior is
 * covered by emails-hub.test.tsx — this file guards only the polish.
 */

vi.mock('@/app/(default)/settings/automations/emails/actions', () => ({
  saveEmailAutomationAction: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock('@/app/(default)/settings/reminders/actions', () => ({
  saveReminderSettingsAction: vi.fn(async () => ({ ok: true as const })),
}))

const CONFIG = resolveEmailAutomations(null)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('EmailsHub polish', () => {
  it('a token chip advertises the sample value it fills to', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="booking_confirmation" />)
    // Accessible name stays the bare token (the visual tooltip is aria-hidden so
    // it doesn't double it); the title + tooltip carry the sample value.
    const chip = screen.getByRole('button', { name: '{{firstName}}' })
    expect(chip.getAttribute('title')).toContain('Jordan')
    // The visual tooltip renders "{{firstName}} → Jordan".
    expect(chip.textContent).toContain('→ Jordan')
  })

  it('reminder hour presets snap the offset and only offer values inside the window', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="appointment_reminder" />)
    // 2h is below the 4h minimum, so it must not be offered as a preset
    expect(screen.queryByRole('button', { name: '2h' })).toBeNull()
    const offset = document.getElementById('reminder-offset-hours') as HTMLInputElement
    expect(offset.value).toBe(String(REMINDER_DEFAULTS.offsetHours))
    fireEvent.click(screen.getByRole('button', { name: '48h' }))
    expect((document.getElementById('reminder-offset-hours') as HTMLInputElement).value).toBe('48')
  })

  it('the reminder offset input is described by its helper text', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="appointment_reminder" />)
    const offset = document.getElementById('reminder-offset-hours') as HTMLInputElement
    const describedBy = offset.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).not.toBeNull()
  })

  it('warns when every automated email would be off', () => {
    // All self-toggling emails off + reminder off = nothing fires.
    const off = resolveEmailAutomations({
      booking_confirmation: { enabled: false },
      cancellation: { enabled: false },
      contact_ack: { enabled: false },
    })
    render(
      <EmailsHub
        config={off}
        reminder={{ ...REMINDER_DEFAULTS, enabled: false }}
        canManage
        focusKey={null}
      />,
    )
    expect(screen.getByText(/No automated emails will be sent/i)).toBeTruthy()
  })

  it('does not warn while at least one automatic email is on', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey={null} />)
    expect(screen.queryByText(/No automated emails will be sent/i)).toBeNull()
  })

  it('the "all off" callout appears live when the last email is toggled off', () => {
    const off = resolveEmailAutomations({
      booking_confirmation: { enabled: false },
      cancellation: { enabled: false },
    })
    // contact_ack still on + reminder off -> not all off yet
    render(<EmailsHub config={off} reminder={{ ...REMINDER_DEFAULTS, enabled: false }} canManage focusKey="contact_ack" />)
    expect(screen.queryByText(/No automated emails will be sent/i)).toBeNull()
    // turn the last one off inside its open card
    fireEvent.click(screen.getByRole('switch', { name: 'Send this email automatically' }))
    expect(screen.getByText(/No automated emails will be sent/i)).toBeTruthy()
  })
})
