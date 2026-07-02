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

  it('renders the default journey (72h + 24h) as two touch rows', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="appointment_reminder" />)
    const t1 = screen.getByLabelText('Reminder 1: hours before the visit') as HTMLInputElement
    const t2 = screen.getByLabelText('Reminder 2: hours before the visit') as HTMLInputElement
    expect(t1.value).toBe('72')
    expect(t2.value).toBe('24')
  })

  it('journey presets swap the whole touch list in one click', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="appointment_reminder" />)
    fireEvent.click(screen.getByRole('button', { name: 'Day before only' }))
    expect(screen.getByLabelText('Reminder 1: hours before the visit')).toHaveProperty('value', '24')
    expect(screen.queryByLabelText('Reminder 2: hours before the visit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1 week + 3 days + day before' }))
    expect(screen.getByLabelText('Reminder 3: hours before the visit')).toHaveProperty('value', '24')
  })

  it('"+ Add a reminder" appends a touch and caps at the maximum', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="appointment_reminder" />)
    fireEvent.click(screen.getByRole('button', { name: /Add a reminder/ }))
    expect(screen.getByLabelText('Reminder 3: hours before the visit')).toBeTruthy()
    // At the cap the button disables.
    expect((screen.getByRole('button', { name: /Add a reminder/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('warns when every automated email would be off', () => {
    // All self-toggling emails off + reminder off = nothing fires.
    const off = resolveEmailAutomations({
      booking_confirmation: { enabled: false },
      appointment_reminder_confirmed: { enabled: false },
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
      appointment_reminder_confirmed: { enabled: false },
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
