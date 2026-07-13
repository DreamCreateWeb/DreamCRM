import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EmailsHub from '@/app/(default)/settings/automations/emails/emails-hub'
import { resolveEmailAutomations } from '@/lib/types/email-automations'
import { REMINDER_DEFAULTS } from '@/lib/types/reminders'

/**
 * The hub renders one editable card per automated email, deep-links to a
 * specific email via the ?email= prop, and saves through the server action.
 */

const saveEmail = vi.fn(async () => ({ ok: true as const }))
const saveReminder = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/settings/automations/emails/actions', () => ({
  saveEmailAutomationAction: (...a: unknown[]) => saveEmail(...(a as [])),
  saveReminderSettingsAction: (...a: unknown[]) => saveReminder(...(a as [])),
}))

const CONFIG = resolveEmailAutomations(null)

beforeEach(() => {
  saveEmail.mockClear()
  saveReminder.mockClear()
})

describe('EmailsHub', () => {
  it('renders a card for every automated email', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey={null} />)
    expect(screen.getByText('Appointment confirmation')).toBeTruthy()
    expect(screen.getByText('Appointment reminder')).toBeTruthy()
    expect(screen.getByText('Intake form request')).toBeTruthy()
    expect(screen.getByText('Appointment cancellation')).toBeTruthy()
    expect(screen.getByText('Patient portal invite')).toBeTruthy()
    expect(screen.getByText('Review request')).toBeTruthy()
    expect(screen.getByText('Website enquiry auto-reply')).toBeTruthy()
  })

  it('expands the ?email= target card and leaves others collapsed', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="booking_confirmation" />)
    // fields exist only when the card is open
    expect(document.getElementById('booking_confirmation-subject')).not.toBeNull()
    expect(document.getElementById('review_request-subject')).toBeNull()
  })

  it('saves an edited email through the action with the changed slot + enabled flag', async () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="booking_confirmation" />)
    const subj = document.getElementById('booking_confirmation-subject') as HTMLInputElement
    fireEvent.change(subj, { target: { value: 'New subject' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveEmail).toHaveBeenCalledTimes(1))
    const [key, override] = saveEmail.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(key).toBe('booking_confirmation')
    expect(override.subject).toBe('New subject')
    expect(override.enabled).toBe(true)
  })

  it('the reminder card also saves reminder timing (reminder_settings)', async () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="appointment_reminder" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveEmail).toHaveBeenCalled())
    expect(saveReminder).toHaveBeenCalledTimes(1)
  })

  it('a token chip inserts the token into the focused field', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage focusKey="booking_confirmation" />)
    const subj = document.getElementById('booking_confirmation-subject') as HTMLInputElement
    const before = subj.value
    subj.focus()
    fireEvent.focus(subj)
    fireEvent.click(screen.getByRole('button', { name: '{{clinicPhone}}' }))
    expect(subj.value).toContain('{{clinicPhone}}')
    expect(subj.value.length).toBeGreaterThan(before.length)
  })

  it('is read-only for a member (no Save button)', () => {
    render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage={false} focusKey="booking_confirmation" />)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})
